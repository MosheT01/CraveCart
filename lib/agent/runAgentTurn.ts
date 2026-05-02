import { AgentToolRuntime } from "@/lib/agent/toolRuntime"
import {
  chunkTextForStreaming,
  extractFunctionCalls,
  extractResponseText,
  generateRecipeWrapUp,
  generateGeminiTurn,
  getAgentSystemPrompt,
  toGeminiContents,
} from "@/lib/agent/gemini"
import { detectUnsupportedCartOperation, isCartStatusFollowup, isVideoContextFollowup, shouldUseCarryoverContext, suggestToolDomains, hasExplicitBuyIntent } from "@/lib/agent/intent"
import { getAgentSessionState, setAgentSessionState, type UserPreferences, parseUserPreferences, isPreferencesConfirmation, getUpdatedPreferencesFromResponse } from "@/lib/agent/sessionState"
import { devLog } from "@/lib/dev"
import type { AgentStreamEvent, AgentTurnResult, ChatMessage, ToolTraceEntry } from "@/lib/types"

interface RunAgentTurnInput {
  messages: ChatMessage[]
  sessionId: string
}

type EventSink = (event: AgentStreamEvent) => Promise<void> | void

const MAX_TOOL_LOOPS = 12
const MAX_CONSECUTIVE_SAME_TOOL = 3
const MAX_EMPTY_RESPONSE_LOOPS = 2

export async function runAgentTurn(input: RunAgentTurnInput, sink: EventSink = () => undefined): Promise<AgentTurnResult> {
  const latestUserMessage = input.messages[input.messages.length - 1]?.content ?? ""
  const initialSessionState = getAgentSessionState(input.sessionId)
  const toolRuntime = new AgentToolRuntime(input.messages, input.sessionId, initialSessionState)
  const activity: ToolTraceEntry[] = []
  const contents: unknown[] = toGeminiContents(input.messages)
  const systemInstruction = getAgentSystemPrompt(suggestToolDomains(latestUserMessage), initialSessionState?.userPreferences ?? null)
  let forceTextReply = false
  let forcedShoppingContinuation = false
  let forcedPostCartFollowup = false
  let forcedVideoContextReply = false
  let turnArtifact: AgentTurnResult["artifact"] = null
  let turnCart: AgentTurnResult["cart"] = null

  try {
    const domainHint = suggestToolDomains(latestUserMessage)
    const buyIntent = hasExplicitBuyIntent(latestUserMessage)
    const needsPreferences = !initialSessionState?.userPreferences && (domainHint === "kroger" || domainHint === "hybrid" || buyIntent)
    const needsConfirmation = initialSessionState?.userPreferences && !initialSessionState?.preferencesConfirmed

    if (needsPreferences) {
      const parsedPrefs = parseUserPreferences(latestUserMessage)
      if (parsedPrefs) {
        const defaultState = {
          latestArtifact: null,
          latestCart: null,
          latestDish: "",
          latestRecipeSource: "none" as const,
          latestRecipeText: null,
          latestFallbackStructuredRecipe: null,
          latestExtractedRecipe: null,
          pendingSelections: [],
          unmatchedIngredients: [],
          userPreferences: null,
          preferencesConfirmed: false,
        }
        const updatedState = {
          ...defaultState,
          ...initialSessionState,
          userPreferences: parsedPrefs,
          preferencesConfirmed: true,
        }
        setAgentSessionState(input.sessionId, updatedState)
      } else {
        const assistantMessage =
          "I'd be happy to help you find a recipe! First, a few quick questions:\n\n1. Do you have any food allergies? (e.g., nuts, gluten, dairy, shellfish, eggs)\n2. Any dietary preferences? (e.g., vegan, vegetarian, halal, kosher, organic, low-carb, keto)\n3. Any ingredients you avoid? (e.g., alcohol, pork, artificial sweeteners)\n4. Any preference for organic, gluten-free, or specific brands?"

        for (const chunk of chunkTextForStreaming(assistantMessage)) {
          await sink({
            type: "assistant_text_delta",
            delta: chunk,
          })
        }

        return {
          assistantMessage,
          activity,
          artifact: null,
          cart: null,
          needsAuth: false,
          authUrl: null,
        }
      }
    }

    if (needsConfirmation) {
      const prefs = initialSessionState.userPreferences
      if (isPreferencesConfirmation(latestUserMessage, !!prefs)) {
        const isNegative = /\bno\b/i.test(latestUserMessage.toLowerCase()) || /\bwrong\b/i.test(latestUserMessage.toLowerCase()) || /\bchange\b/i.test(latestUserMessage.toLowerCase()) || /\bupdate\b/i.test(latestUserMessage.toLowerCase()) || /\bfix\b/i.test(latestUserMessage.toLowerCase())

        if (isNegative && prefs) {
          const updatedPrefs = getUpdatedPreferencesFromResponse(latestUserMessage, prefs)
          if (updatedPrefs) {
            const updatedState = {
              ...initialSessionState,
              userPreferences: updatedPrefs,
              preferencesConfirmed: false,
            }
            setAgentSessionState(input.sessionId, updatedState)
          } else {
            const assistantMessage =
              "I understand you'd like to update your preferences. Please tell me your allergies, dietary restrictions, and any ingredients to avoid."

            for (const chunk of chunkTextForStreaming(assistantMessage)) {
              await sink({
                type: "assistant_text_delta",
                delta: chunk,
              })
            }

            return {
              assistantMessage,
              activity,
              artifact: null,
              cart: null,
              needsAuth: false,
              authUrl: null,
            }
          }
        } else {
          const confirmedState = {
            ...initialSessionState,
            preferencesConfirmed: true,
          }
          setAgentSessionState(input.sessionId, confirmedState)
        }
      } else {
        const allergiesList = prefs?.allergies.length ? prefs.allergies.join(", ") : "none"
        const dietaryList = prefs?.dietary.length ? prefs.dietary.join(", ") : "none"
        const avoidedList = prefs?.avoidedIngredients.length ? prefs.avoidedIngredients.join(", ") : "none"

        const assistantMessage =
          `Quick confirmation for safety:\n\n` +
          `Allergies: ${allergiesList}\n` +
          `Dietary preferences: ${dietaryList}\n` +
          `Ingredients to avoid: ${avoidedList}\n\n` +
          `Is this correct? Please confirm so I can make sure to avoid any unsafe ingredients.`

        for (const chunk of chunkTextForStreaming(assistantMessage)) {
          await sink({
            type: "assistant_text_delta",
            delta: chunk,
          })
        }

        return {
          assistantMessage,
          activity,
          artifact: null,
          cart: null,
          needsAuth: false,
          authUrl: null,
        }
      }
    }

    if (initialSessionState && shouldUseCarryoverContext(latestUserMessage)) {
      const carryoverPrompt = toolRuntime.buildCarryoverContextPrompt(latestUserMessage)
      if (carryoverPrompt) {
        contents.unshift({
          role: "user",
          parts: [{ text: carryoverPrompt }],
        })
      }
    }

    const savedArtifact = toolRuntime.getLatestArtifact()
    if (
      initialSessionState &&
      isVideoContextFollowup(latestUserMessage) &&
      savedArtifact?.kind === "video" &&
      toolRuntime.getLatestRecipeText() &&
      !toolRuntime.getPermissionState().allowCartMutation
    ) {
      contents.unshift({
        role: "user",
        parts: [{
          text: buildSavedVideoContextPrompt({
            userMessage: latestUserMessage,
            title: savedArtifact.video.title,
            channel: savedArtifact.video.channel,
            transcriptAvailable: savedArtifact.transcriptAvailable,
            transcriptStatus: savedArtifact.transcriptStatus,
            transcriptMessage: savedArtifact.transcriptMessage,
            recipeSource: savedArtifact.recipeSource,
            recipeText: toolRuntime.getLatestRecipeText() ?? "",
          }),
        }],
      })
      forceTextReply = true
      forcedVideoContextReply = true
      turnArtifact = savedArtifact
    }

    if (
      initialSessionState &&
      shouldUseCarryoverContext(latestUserMessage) &&
      !toolRuntime.hasRecipeContext() &&
      !toolRuntime.getLatestCart() &&
      toolRuntime.getPendingSelectionCount() === 0
    ) {
      const assistantMessage =
        "I don’t have a usable recipe or transcript from the previous turn yet, so I can’t buy the ingredients safely. Ask me to search for another video or try a different dish."

      for (const chunk of chunkTextForStreaming(assistantMessage)) {
        await sink({
          type: "assistant_text_delta",
          delta: chunk,
        })
      }

      return {
        assistantMessage,
        activity,
        artifact: null,
        cart: null,
        needsAuth: false,
        authUrl: null,
      }
    }

    const unsupportedCartOperation = detectUnsupportedCartOperation(latestUserMessage)
    if (unsupportedCartOperation) {
      const assistantMessage = unsupportedCartOperationMessage(unsupportedCartOperation)
      for (const chunk of chunkTextForStreaming(assistantMessage)) {
        await sink({
          type: "assistant_text_delta",
          delta: chunk,
        })
      }

      return {
        assistantMessage,
        activity,
        artifact: null,
        cart: null,
        needsAuth: false,
        authUrl: null,
      }
    }

    if (initialSessionState && isCartStatusFollowup(latestUserMessage)) {
      const latestCart = toolRuntime.getLatestCart()
      if (latestCart) {
        const assistantMessage =
          latestCart.status === "cart_ready"
            ? `Yes. Your ${latestCart.dish} cart is ready with ${latestCart.itemsAdded} items.`
            : `Not yet. I prepared ${latestCart.itemsAdded} matched items for ${latestCart.dish}, but some ingredients are still unresolved: ${latestCart.unmatchedIngredients.join(", ")}.`

        for (const chunk of chunkTextForStreaming(assistantMessage)) {
          await sink({
            type: "assistant_text_delta",
            delta: chunk,
          })
        }

        await sink({
          type: "cart_ready",
          message: assistantMessage,
          cart: latestCart,
          activity,
        })

        return {
          assistantMessage,
          activity,
          artifact: latestCart,
          cart: latestCart,
          needsAuth: false,
          authUrl: null,
        }
      }

      if (toolRuntime.getPendingSelectionCount() > 0) {
        const assistantMessage = "I matched the recipe ingredients and I’m ready to add them, but Kroger still needs to be connected before I can finish the cart."
        const latestArtifact = toolRuntime.getLatestArtifact()
        const authArtifact = latestArtifact?.kind === "video" ? latestArtifact : null

        for (const chunk of chunkTextForStreaming(assistantMessage)) {
          await sink({
            type: "assistant_text_delta",
            delta: chunk,
          })
        }

        await sink({
          type: "needs_kroger_auth",
          message: assistantMessage,
          authUrl: "/auth/kroger",
          artifact: authArtifact,
          activity,
        })

        return {
          assistantMessage,
          activity,
          artifact: latestArtifact,
          cart: null,
          needsAuth: true,
          authUrl: "/auth/kroger",
        }
      }
    }

    let lastToolName = ""
    let consecutiveSameTool = 0
    let emptyResponseCount = 0

    for (let iteration = 0; iteration < MAX_TOOL_LOOPS; iteration += 1) {
      const turnSystemInstruction = forceTextReply
        ? `${systemInstruction}\nYou are in the final response phase for this turn. Do not call tools. If the user asked for recipe help, recipe instructions, or how to make the dish, give concise step-by-step cooking instructions first, then mention the cart status in one short paragraph.`
        : systemInstruction
      const response = await generateGeminiTurn({
        contents,
        functionDeclarations: forceTextReply ? [] : toolRuntime.getDeclarations(),
        systemInstruction: turnSystemInstruction,
      })

      const functionCalls = extractFunctionCalls(response)
      const candidateParts = response.candidates?.[0]?.content?.parts ?? []

      if (functionCalls.length === 0) {
        emptyResponseCount += 1
        if (emptyResponseCount >= MAX_EMPTY_RESPONSE_LOOPS && !turnCart && !forceTextReply) {
          const assistantMessage = "I'm having trouble completing that request. Could you try rephrasing or starting fresh?"
          for (const chunk of chunkTextForStreaming(assistantMessage)) {
            await sink({
              type: "assistant_text_delta",
              delta: chunk,
            })
          }
          return {
            assistantMessage,
            activity,
            artifact: turnArtifact,
            cart: turnCart,
            needsAuth: false,
            authUrl: null,
          }
        }
        if (toolRuntime.shouldAutoFinalizeCart()) {
          const traceId = randomTraceId()
          const startedTrace: ToolTraceEntry = {
            id: traceId,
            name: "add_kroger_items_to_cart",
            status: "started",
            summary: "Auto-finalizing the cart from the matched Kroger items.",
            arguments: {},
          }
          activity.push(startedTrace)
          await sink({
            type: "tool_call_started",
            trace: startedTrace,
          })

          const outcome = await toolRuntime.autoFinalizeCartFromSelections()
          if (outcome) {
            if (outcome.artifact) {
              turnArtifact = outcome.artifact
              if (outcome.artifact.kind === "cart") {
                turnCart = outcome.artifact
              }
            }

            const finishedTrace: ToolTraceEntry = {
              id: traceId,
              name: "add_kroger_items_to_cart",
              status: "finished",
              summary: outcome.summary,
              arguments: {},
              output: outcome.response,
            }
            activity.push(finishedTrace)
            await sink({
              type: "tool_call_finished",
              trace: finishedTrace,
            })

            if (outcome.needsAuth) {
              const assistantMessage =
                outcome.authUserMessage ?? "Sign in with Kroger using the button below, then continue in chat."
              for (const chunk of chunkTextForStreaming(assistantMessage)) {
                await sink({
                  type: "assistant_text_delta",
                  delta: chunk,
                })
              }

              const latestArtifact = toolRuntime.getLatestArtifact()
              await sink({
                type: "needs_kroger_auth",
                message: assistantMessage,
                authUrl: outcome.authUrl ?? "/auth/kroger",
                artifact: latestArtifact?.kind === "video" ? latestArtifact : null,
                activity,
              })

              return {
                assistantMessage,
                activity,
                artifact: latestArtifact,
                cart: null,
                needsAuth: true,
                authUrl: outcome.authUrl ?? "/auth/kroger",
              }
            }

            const followupPrompt = toolRuntime.buildPostCartFollowupPrompt()
            if (followupPrompt) {
              contents.push({
                role: "user",
                parts: [{ text: followupPrompt }],
              })
              forceTextReply = true
              forcedPostCartFollowup = true
              continue
            }
          }
        }

        const shoppingContinuationPrompt = !forceTextReply && !forcedShoppingContinuation
          ? toolRuntime.buildShoppingContinuationPrompt()
          : null

        if (shoppingContinuationPrompt) {
          contents.push({
            role: "user",
            parts: [{ text: shoppingContinuationPrompt }],
          })
          forcedShoppingContinuation = true
          continue
        }

        let assistantMessage = extractResponseText(response)
        if (
          turnCart &&
          !forcedPostCartFollowup &&
          (!assistantMessage || shouldForceRecipeWrapUp(latestUserMessage, assistantMessage))
        ) {
          const followupPrompt = toolRuntime.buildPostCartFollowupPrompt()
          if (followupPrompt) {
            contents.push({
              role: "user",
              parts: [{ text: followupPrompt }],
            })
            forceTextReply = true
            forcedPostCartFollowup = true
            continue
          }
        }
        if (turnCart && shouldForceRecipeWrapUp(latestUserMessage, assistantMessage)) {
          const latestCart = turnCart
          const recipeWrapUp = await generateRecipeWrapUp({
            userMessage: latestUserMessage,
            dish: latestCart.dish,
            recipeText: toolRuntime.getLatestRecipeText(),
            cart: latestCart,
          })
          if (recipeWrapUp && !isGenericCartReply(recipeWrapUp)) {
            assistantMessage = recipeWrapUp
          } else {
            assistantMessage = toolRuntime.buildLocalRecipeWrapUp() ?? assistantMessage
          }
        }
        const streamedMessage = assistantMessage || fallbackAssistantMessage(turnCart, turnArtifact)

        for (const chunk of chunkTextForStreaming(streamedMessage)) {
          await sink({
            type: "assistant_text_delta",
            delta: chunk,
          })
        }

        if (turnCart) {
          await sink({
            type: "cart_ready",
            message: streamedMessage,
            cart: turnCart,
            activity,
          })
        } else if (turnArtifact?.kind === "video" && toolRuntime.getPermissionState().allowCartMutation === false) {
          // Pure video/research turns finish on text alone.
        }

        return {
          assistantMessage: streamedMessage,
          activity,
          artifact: turnArtifact,
          cart: turnCart,
          needsAuth: false,
          authUrl: null,
        }
      }

      contents.push({
        role: "model",
        parts: candidateParts,
      })

      const functionResponses = []

      for (const call of functionCalls) {
        if (call.name === lastToolName) {
          consecutiveSameTool += 1
        } else {
          consecutiveSameTool = 1
          lastToolName = call.name
        }

        if (consecutiveSameTool > MAX_CONSECUTIVE_SAME_TOOL) {
          const assistantMessage = `I've tried ${call.name} multiple times without progress. Let's try a different approach.`
          for (const chunk of chunkTextForStreaming(assistantMessage)) {
            await sink({
              type: "assistant_text_delta",
              delta: chunk,
            })
          }
          return {
            assistantMessage,
            activity,
            artifact: turnArtifact,
            cart: turnCart,
            needsAuth: false,
            authUrl: null,
          }
        }

        const traceId = call.id || randomTraceId()
        const startedTrace: ToolTraceEntry = {
          id: traceId,
          name: call.name,
          status: "started",
          summary: `Calling ${call.name}.`,
          arguments: call.args,
        }
        activity.push(startedTrace)
        await sink({
          type: "tool_call_started",
          trace: startedTrace,
        })

        const outcome = await toolRuntime.execute(call.name, call.args)
        if (outcome.artifact) {
          turnArtifact = outcome.artifact
          if (outcome.artifact.kind === "cart") {
            turnCart = outcome.artifact
          }
        }

        const finishedTrace: ToolTraceEntry = {
          id: traceId,
          name: call.name,
          status: "finished",
          summary: outcome.summary,
          arguments: call.args,
          output: outcome.response,
        }
        activity.push(finishedTrace)
        await sink({
          type: "tool_call_finished",
          trace: finishedTrace,
        })

        if (outcome.needsAuth) {
          const assistantMessage =
            outcome.authUserMessage ?? "Sign in with Kroger using the button below, then continue in chat."
          for (const chunk of chunkTextForStreaming(assistantMessage)) {
            await sink({
              type: "assistant_text_delta",
              delta: chunk,
            })
          }

          const latestArtifact = toolRuntime.getLatestArtifact()
          await sink({
            type: "needs_kroger_auth",
            message: assistantMessage,
            authUrl: outcome.authUrl ?? "/auth/kroger",
            artifact: latestArtifact?.kind === "video" ? latestArtifact : null,
            activity,
          })

          return {
            assistantMessage,
            activity,
            artifact: latestArtifact,
            cart: null,
            needsAuth: true,
            authUrl: outcome.authUrl ?? "/auth/kroger",
          }
        }

        functionResponses.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: outcome.response,
          },
        })
      }

      contents.push({
        role: "user",
        parts: functionResponses,
      })
      forceTextReply = forcedVideoContextReply
      forcedShoppingContinuation = false
    }

    throw new Error("The agent hit the maximum tool-call loop limit.")
  } catch (error) {
    const message = error instanceof Error ? error.message : "CraveCart hit an unexpected agent error."
    devLog("agent_error", message)
    await sink({
      type: "error",
      message,
    })
    throw error
  } finally {
    setAgentSessionState(input.sessionId, toolRuntime.createSessionState())
    await toolRuntime.close()
  }
}

function fallbackAssistantMessage(cart: AgentTurnResult["cart"], artifact: AgentTurnResult["artifact"]) {
  if (cart) {
    return cart.status === "partial_cart_ready" ? "Your Kroger cart is mostly ready." : "Your Kroger cart is ready."
  }

  if (artifact?.kind === "video") {
    return `I checked ${artifact.video.title}.`
  }

  return "I finished the request."
}

function randomTraceId() {
  return `tool_${Math.random().toString(36).slice(2, 10)}`
}

function shouldForceRecipeWrapUp(userMessage: string, assistantMessage: string) {
  const normalizedAssistantMessage = assistantMessage.trim().toLowerCase()
  if (!normalizedAssistantMessage) {
    return true
  }

  if (!wantsRecipeGuidance(userMessage)) {
    return false
  }

  return (
    normalizedAssistantMessage === "your kroger cart is ready." ||
    normalizedAssistantMessage === "your kroger cart is mostly ready." ||
    /^your kroger cart is (mostly )?ready[.!]?$/.test(normalizedAssistantMessage)
  )
}

function wantsRecipeGuidance(userMessage: string) {
  return /\b(recipe|instructions|make|cook|bake|how to)\b/i.test(userMessage)
}

function isGenericCartReply(message: string) {
  return /^your kroger cart is (mostly )?ready[.!]?\s*$/i.test(message.trim())
}

function buildSavedVideoContextPrompt(input: {
  userMessage: string
  title: string
  channel: string
  transcriptAvailable: boolean
  transcriptStatus?: "available" | "unavailable" | "blocked" | "error"
  transcriptMessage?: string
  recipeSource: "youtube_transcript" | "fallback_recipe" | "video_metadata" | "none"
  recipeText: string
}) {
  const transcriptStatusLine =
    input.transcriptStatus && input.transcriptStatus !== "available"
      ? `Transcript fetch status: ${input.transcriptStatus}.`
      : ""
  const transcriptGuidance = !input.transcriptAvailable
    ? input.transcriptStatus === "blocked"
      ? "The video may still have captions on YouTube, but transcript retrieval from the server was blocked. Do not say the video has no captions. Answer from the saved title and description context, and clearly say the answer is inferred because the server could not fetch the transcript."
      : input.transcriptStatus === "error"
        ? "The transcript could not be retrieved right now. Answer from the saved title and description context, and clearly say the answer is inferred from the available video metadata."
        : "The transcript was unavailable. Infer the answer from the saved video title and description context, and say that it is inferred from the available video metadata."
    : "Use the saved transcript and description context directly."
  const recipeSourceGuidance =
    input.recipeSource === "youtube_transcript"
      ? "The earlier recipe context came from the saved YouTube transcript plus the video metadata."
      : input.recipeSource === "video_metadata"
        ? "The earlier recipe context came from the video title and description only. Do not say it came from the transcript."
        : input.recipeSource === "fallback_recipe"
          ? "The earlier recipe context came from CraveCart's fallback recipe, not from the YouTube transcript."
          : "The earlier recipe source is unknown. Do not claim it came from the transcript."

  return [
    "Server note: answer from the saved video context already loaded in this session. Do not call any tools.",
    `User follow-up: ${input.userMessage}`,
    `Current video: ${input.title} by ${input.channel}.`,
    `Transcript available: ${input.transcriptAvailable ? "yes" : "no"}.`,
    transcriptStatusLine,
    input.transcriptMessage ? `Transcript note: ${input.transcriptMessage}` : "",
    `Saved recipe source: ${input.recipeSource}.`,
    transcriptGuidance,
    recipeSourceGuidance,
    `Saved context:\n${input.recipeText.slice(0, 5000)}`,
    "If the user asks about the transcript, answer with the actual transcript status first, then explain what source the earlier recipe came from.",
    "Give a concise, direct answer to the user's question.",
  ].join("\n\n")
}

function unsupportedCartOperationMessage(operation: "clear_cart" | "remove_item" | "update_quantity") {
  const action =
    operation === "clear_cart"
      ? "clear your cart"
      : operation === "remove_item"
        ? "remove items from your cart"
        : "change item quantities in your cart"

  return `I can't ${action} on the real Kroger cart from CraveCart yet. Kroger's public cart API only supports adding items, so deletions and quantity edits still have to be done on the Kroger cart page: https://www.kroger.com/cart`
}
