import type { ExtractedRecipe } from "@/lib/types"

export interface FallbackRecipe {
  dish: string
  text: string
  structured: ExtractedRecipe
}

const FALLBACK_RECIPES: Record<string, FallbackRecipe> = {
  "american cheeseburger": {
    dish: "American cheeseburger",
    text: `
American cheeseburger for 4 servings.
Ingredients:
- 2 pounds ground beef 80/20
- 4 brioche burger buns
- 8 American cheese slices
- 1 head lettuce
- 2 tomatoes
- 1 yellow onion
- 1 jar dill pickles
- ketchup
- yellow mustard
- mayonnaise
- salt
- black pepper
- neutral oil
Instructions:
Form burger patties, season with salt and pepper, sear on a hot pan, top with American cheese, toast the buns, and build with lettuce, tomato, onion, pickles, ketchup, mustard, and mayo.
    `.trim(),
    structured: {
      dish: "American cheeseburger",
      servings: 4,
      ingredients: [
        { name: "ground beef 80/20", normalizedName: "ground beef", quantity: 2, unit: "lb", category: "meat", required: true, pantryItem: false, notes: "80/20 blend works best for burgers" },
        { name: "brioche burger buns", normalizedName: "burger buns", quantity: 4, unit: "buns", category: "bakery", required: true, pantryItem: false, notes: null },
        { name: "American cheese slices", normalizedName: "American cheese slices", quantity: 8, unit: "slices", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "lettuce", normalizedName: "lettuce", quantity: 1, unit: "head", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "tomatoes", normalizedName: "tomatoes", quantity: 2, unit: "count", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "yellow onion", normalizedName: "yellow onion", quantity: 1, unit: "count", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "dill pickles", normalizedName: "dill pickles", quantity: 1, unit: "jar", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "ketchup", normalizedName: "ketchup", quantity: 1, unit: "bottle", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "yellow mustard", normalizedName: "yellow mustard", quantity: 1, unit: "bottle", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "mayonnaise", normalizedName: "mayonnaise", quantity: 1, unit: "jar", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "salt", normalizedName: "salt", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "black pepper", normalizedName: "black pepper", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "neutral oil", normalizedName: "vegetable oil", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
      ],
      pantryAssumptions: ["Salt, black pepper, and neutral oil are treated as pantry staples."],
      instructionsSummary: "Sear seasoned beef patties, melt cheese on top, toast the buns, and assemble with classic American toppings.",
    },
  },
  "chicken alfredo": {
    dish: "Chicken Alfredo",
    text: `
Chicken Alfredo for 4 servings.
Ingredients:
- 1.5 pounds chicken breast
- 12 ounces fettuccine
- 1 cup heavy cream
- 1 cup grated parmesan cheese
- 4 tablespoons butter
- 4 cloves garlic
- 1 bunch parsley
- salt
- black pepper
Instructions:
Cook the pasta, pan-sear sliced chicken, make a sauce with butter, garlic, cream, and parmesan, then toss everything together and finish with parsley.
    `.trim(),
    structured: {
      dish: "Chicken Alfredo",
      servings: 4,
      ingredients: [
        { name: "chicken breast", normalizedName: "boneless skinless chicken breast", quantity: 1.5, unit: "lb", category: "meat", required: true, pantryItem: false, notes: null },
        { name: "fettuccine", normalizedName: "fettuccine pasta", quantity: 12, unit: "oz", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "heavy cream", normalizedName: "heavy cream", quantity: 1, unit: "cup", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "parmesan cheese", normalizedName: "grated parmesan cheese", quantity: 1, unit: "cup", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "butter", normalizedName: "butter", quantity: 4, unit: "tbsp", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "garlic", normalizedName: "garlic", quantity: 4, unit: "cloves", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "parsley", normalizedName: "parsley", quantity: 1, unit: "bunch", category: "produce", required: false, pantryItem: false, notes: "Optional garnish" },
        { name: "salt", normalizedName: "salt", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "black pepper", normalizedName: "black pepper", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
      ],
      pantryAssumptions: ["Salt and pepper are pantry staples."],
      instructionsSummary: "Cook the pasta, sear the chicken, and combine both with a creamy parmesan garlic sauce.",
    },
  },
  "chocolate chip cookies": {
    dish: "Chocolate chip cookies",
    text: `
Chocolate chip cookies for 4 servings.
Ingredients:
- 2 1/4 cups all-purpose flour
- 1 teaspoon baking soda
- 1 teaspoon salt
- 1 cup butter
- 3/4 cup granulated sugar
- 3/4 cup brown sugar
- 2 eggs
- 2 teaspoons vanilla extract
- 2 cups chocolate chips
Instructions:
Cream butter and sugars, add eggs and vanilla, stir in dry ingredients and chocolate chips, scoop, and bake until golden.
    `.trim(),
    structured: {
      dish: "Chocolate chip cookies",
      servings: 4,
      ingredients: [
        { name: "all-purpose flour", normalizedName: "all-purpose flour", quantity: 2.25, unit: "cups", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "baking soda", normalizedName: "baking soda", quantity: 1, unit: "tsp", category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "salt", normalizedName: "salt", quantity: 1, unit: "tsp", category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "butter", normalizedName: "butter", quantity: 1, unit: "cup", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "granulated sugar", normalizedName: "granulated sugar", quantity: 0.75, unit: "cup", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "brown sugar", normalizedName: "brown sugar", quantity: 0.75, unit: "cup", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "eggs", normalizedName: "eggs", quantity: 2, unit: "count", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "vanilla extract", normalizedName: "vanilla extract", quantity: 2, unit: "tsp", category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "chocolate chips", normalizedName: "semi sweet chocolate chips", quantity: 2, unit: "cups", category: "pantry", required: true, pantryItem: false, notes: null },
      ],
      pantryAssumptions: ["Baking soda, salt, and vanilla extract are treated as pantry items."],
      instructionsSummary: "Cream the butter and sugars, mix in eggs, fold in the dry ingredients and chips, then bake until golden.",
    },
  },
  "caesar salad": {
    dish: "Caesar salad",
    text: `
Caesar salad for 4 servings.
Ingredients:
- 2 romaine hearts
- 1 cup croutons
- 1/2 cup grated parmesan cheese
- 1 lemon
- 1 garlic clove
- mayonnaise
- dijon mustard
- anchovy paste
- Worcestershire sauce
- olive oil
- black pepper
Instructions:
Make a quick dressing with lemon, garlic, mayo, Dijon, anchovy paste, Worcestershire, and olive oil, then toss with chopped romaine, croutons, and parmesan.
    `.trim(),
    structured: {
      dish: "Caesar salad",
      servings: 4,
      ingredients: [
        { name: "romaine hearts", normalizedName: "romaine hearts", quantity: 2, unit: "count", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "croutons", normalizedName: "croutons", quantity: 1, unit: "bag", category: "bakery", required: true, pantryItem: false, notes: null },
        { name: "grated parmesan cheese", normalizedName: "grated parmesan cheese", quantity: 0.5, unit: "cup", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "lemon", normalizedName: "lemon", quantity: 1, unit: "count", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "garlic", normalizedName: "garlic", quantity: 1, unit: "clove", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "mayonnaise", normalizedName: "mayonnaise", quantity: 1, unit: "jar", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "dijon mustard", normalizedName: "dijon mustard", quantity: 1, unit: "jar", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "anchovy paste", normalizedName: "anchovy paste", quantity: 1, unit: "tube", category: "pantry", required: false, pantryItem: false, notes: "Optional but traditional" },
        { name: "Worcestershire sauce", normalizedName: "Worcestershire sauce", quantity: 1, unit: "bottle", category: "pantry", required: false, pantryItem: false, notes: null },
        { name: "olive oil", normalizedName: "olive oil", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "black pepper", normalizedName: "black pepper", quantity: null, unit: null, category: "pantry", required: true, pantryItem: true, notes: null },
      ],
      pantryAssumptions: ["Olive oil and black pepper are treated as pantry staples."],
      instructionsSummary: "Whisk together the dressing and toss it with romaine, croutons, and parmesan right before serving.",
    },
  },
  "hungarian pizza": {
    dish: "Hungarian Pizza",
    text: `
Hungarian pizza (langalló) for 4 servings.
Ingredients:
- 4 cups bread flour
- 1 packet active dry yeast
- 1 cup warm milk
- 1 teaspoon sugar
- 1 teaspoon salt
- 2 tablespoons vegetable oil
- 1 cup sour cream
- 3 garlic cloves
- 8 ounces smoked sausage
- 6 slices bacon
- 1 red onion
- 2 cups shredded mozzarella cheese
Instructions:
Bloom the yeast in warm milk with sugar, mix into a soft dough with flour, salt, and oil, then let it rise. Stretch the dough into an oval on a sheet pan. Mix sour cream with grated garlic and spread it over the dough. Top with sliced smoked sausage, cooked bacon, red onion, and mozzarella, then bake until golden and bubbling.
    `.trim(),
    structured: {
      dish: "Hungarian Pizza",
      servings: 4,
      ingredients: [
        { name: "bread flour", normalizedName: "bread flour", quantity: 4, unit: "cups", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "active dry yeast", normalizedName: "active dry yeast", quantity: 1, unit: "packet", category: "pantry", required: true, pantryItem: false, notes: null },
        { name: "milk", normalizedName: "milk", quantity: 1, unit: "cup", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "sugar", normalizedName: "granulated sugar", quantity: 1, unit: "tsp", category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "salt", normalizedName: "salt", quantity: 1, unit: "tsp", category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "vegetable oil", normalizedName: "vegetable oil", quantity: 2, unit: "tbsp", category: "pantry", required: true, pantryItem: true, notes: null },
        { name: "sour cream", normalizedName: "sour cream", quantity: 1, unit: "cup", category: "dairy", required: true, pantryItem: false, notes: null },
        { name: "garlic", normalizedName: "garlic", quantity: 3, unit: "cloves", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "smoked sausage", normalizedName: "smoked sausage", quantity: 8, unit: "oz", category: "meat", required: true, pantryItem: false, notes: "Kielbasa or another smoked sausage works well." },
        { name: "bacon", normalizedName: "smoked bacon", quantity: 6, unit: "slices", category: "meat", required: false, pantryItem: false, notes: "Optional but traditional." },
        { name: "red onion", normalizedName: "red onion", quantity: 1, unit: "count", category: "produce", required: true, pantryItem: false, notes: null },
        { name: "mozzarella cheese", normalizedName: "mozzarella cheese", quantity: 2, unit: "cups", category: "dairy", required: true, pantryItem: false, notes: null },
      ],
      pantryAssumptions: ["Sugar, salt, and vegetable oil are treated as pantry staples."],
      instructionsSummary: "Make a yeasted dough, top it with garlicky sour cream, sausage, bacon, onion, and cheese, then bake until golden and bubbling.",
    },
  },
}

export function getFallbackRecipe(dish: string): FallbackRecipe | null {
  return FALLBACK_RECIPES[dish.trim().toLowerCase()] ?? null
}
