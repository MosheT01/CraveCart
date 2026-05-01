import { formatUsd } from "@/lib/format"
import type { CartAddOutcome, CartItemRequest, KrogerProduct } from "@/lib/types"

const MOCK_PRODUCTS: KrogerProduct[] = [
  { productId: "mock-ground-beef", upc: "0001111000001", description: "Kroger Ground Beef 80/20", brand: "Kroger", size: "1 lb", priceValue: 7.99, priceLabel: "$7.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-buns", upc: "0001111000002", description: "Kroger Hamburger Buns", brand: "Kroger", size: "8 ct", priceValue: 2.79, priceLabel: "$2.79", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-cheese", upc: "0001111000003", description: "Kroger American Cheese Slices", brand: "Kroger", size: "16 ct", priceValue: 3.49, priceLabel: "$3.49", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-lettuce", upc: "0001111000004", description: "Fresh Romaine Lettuce Hearts", brand: null, size: "3 ct", priceValue: 3.99, priceLabel: "$3.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-tomato", upc: "0001111000005", description: "Vine Ripe Tomatoes", brand: null, size: "1 lb", priceValue: 2.49, priceLabel: "$2.49", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-onion", upc: "0001111000006", description: "Yellow Onion", brand: null, size: "1 ct", priceValue: 0.99, priceLabel: "$0.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-pickles", upc: "0001111000007", description: "Kroger Dill Pickle Chips", brand: "Kroger", size: "24 oz", priceValue: 3.29, priceLabel: "$3.29", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-ketchup", upc: "0001111000008", description: "Kroger Tomato Ketchup", brand: "Kroger", size: "20 oz", priceValue: 2.39, priceLabel: "$2.39", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-mustard", upc: "0001111000009", description: "Kroger Yellow Mustard", brand: "Kroger", size: "20 oz", priceValue: 1.89, priceLabel: "$1.89", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-mayo", upc: "0001111000010", description: "Kroger Real Mayonnaise", brand: "Kroger", size: "30 oz", priceValue: 4.59, priceLabel: "$4.59", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-chicken", upc: "0001111000011", description: "Kroger Boneless Skinless Chicken Breast", brand: "Kroger", size: "1.5 lb", priceValue: 8.99, priceLabel: "$8.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-fettuccine", upc: "0001111000012", description: "Private Selection Fettuccine Pasta", brand: "Private Selection", size: "16 oz", priceValue: 2.19, priceLabel: "$2.19", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-heavy-cream", upc: "0001111000013", description: "Kroger Heavy Whipping Cream", brand: "Kroger", size: "16 fl oz", priceValue: 3.79, priceLabel: "$3.79", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-parm", upc: "0001111000014", description: "Kroger Grated Parmesan Cheese", brand: "Kroger", size: "8 oz", priceValue: 4.99, priceLabel: "$4.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-flour", upc: "0001111000015", description: "Kroger All Purpose Flour", brand: "Kroger", size: "5 lb", priceValue: 3.69, priceLabel: "$3.69", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-butter", upc: "0001111000016", description: "Kroger Salted Butter", brand: "Kroger", size: "16 oz", priceValue: 4.79, priceLabel: "$4.79", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-sugar", upc: "0001111000017", description: "Kroger Granulated Sugar", brand: "Kroger", size: "4 lb", priceValue: 3.29, priceLabel: "$3.29", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-brown-sugar", upc: "0001111000018", description: "Kroger Brown Sugar", brand: "Kroger", size: "2 lb", priceValue: 2.99, priceLabel: "$2.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-eggs", upc: "0001111000019", description: "Kroger Large Eggs", brand: "Kroger", size: "12 ct", priceValue: 3.49, priceLabel: "$3.49", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-chips", upc: "0001111000020", description: "Kroger Semi Sweet Chocolate Chips", brand: "Kroger", size: "12 oz", priceValue: 2.99, priceLabel: "$2.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-romaine", upc: "0001111000021", description: "Fresh Romaine Hearts", brand: null, size: "3 ct", priceValue: 3.99, priceLabel: "$3.99", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-croutons", upc: "0001111000022", description: "Kroger Caesar Croutons", brand: "Kroger", size: "5 oz", priceValue: 2.49, priceLabel: "$2.49", imageUrl: null, modality: "PICKUP" },
  { productId: "mock-lemon", upc: "0001111000023", description: "Fresh Lemon", brand: null, size: "1 ct", priceValue: 0.79, priceLabel: "$0.79", imageUrl: null, modality: "PICKUP" },
]

export async function mockSearchProducts(query: string): Promise<KrogerProduct[]> {
  const normalized = query.toLowerCase()
  const queryTokens = normalized.split(/[^a-z0-9]+/).filter(Boolean)

  return MOCK_PRODUCTS
    .map((product) => {
      const description = product.description.toLowerCase()
      const tokenScore = queryTokens.reduce((score, token) => score + (description.includes(token) ? 1 : 0), 0)
      return {
        product,
        score: description.includes(normalized) ? tokenScore + 3 : tokenScore,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return (left.product.priceValue ?? 999) - (right.product.priceValue ?? 999)
    })
    .map((entry) => entry.product)
    .slice(0, 5)
}

export async function mockAddToCart(items: CartItemRequest[]): Promise<{ authenticated: boolean; results: CartAddOutcome[] }> {
  return {
    authenticated: true,
    results: items.map((item) => ({
      upc: item.upc,
      quantity: item.quantity,
      success: true,
      message: `Mock-added ${item.quantity} x ${item.upc}`,
    })),
  }
}

export function makeMockEstimatedTotal(upcs: string[]): string {
  const total = upcs.reduce((sum, upc) => sum + (MOCK_PRODUCTS.find((item) => item.upc === upc)?.priceValue ?? 0), 0)
  return formatUsd(total)
}
