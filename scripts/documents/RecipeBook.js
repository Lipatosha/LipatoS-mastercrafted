import { MODULE_ID } from "../main.js";
import { MASTERCRAFTED_CONST } from "../config.js";
import { Recipe } from "./Recipe.js";
import { RecipeBookConfig } from "../apps/RecipeBookConfig.js";

export class RecipeBook {
    constructor() {}

    static allRecipes = {};

    static get inferredActor() {
        return _token?.actor ?? game?.user?.character ?? game?.actors?.find(a => a.isOwner);
    }

    static get actor() {
        const stored = game.actors.get(game.settings.get(MODULE_ID, "persistentClientSettings")?.actor);
        if (stored) return stored;
        const inferred = RecipeBook.inferredActor;
        const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
        game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, actor: inferred?.id });
        return inferred;
    }

    static get inventoryActor() {
        const storedId = game.settings.get(MODULE_ID, "persistentClientSettings")?.inventoryActor;
        if (storedId === "useCraftingActor") return RecipeBook.actor;
        const stored = game.actors.get(storedId);
        if (stored) return stored;
        const inferred = RecipeBook.actor;
        const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
        game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, inventoryActor: inferred?.id });
        return inferred;
    }

    static get editMode() {
        return game.settings.get(MODULE_ID, "persistentClientSettings")?.editMode ?? false;
    }

    static getRecipesByIngredient(ingredientName) {
        const recipes = [];
        const allRecipes = [];
        for (const book of game.journal.contents) {
            for (const page of book.pages) {
                if (!(page.type === "mastercrafted.mastercrafted")) continue;
                allRecipes.push(new Recipe({
                    ...page.flags.mastercrafted,
                    document: page,
                    pageUuid: page.uuid,
                    pageId: page.id,
                    id: page.id,
                    name: page.name,
                    recipeBook: RecipeBook.toObject(book),
                }));
            }
        }
        for (const recipe of allRecipes) {
            if (recipe.hasComponent(ingredientName) || recipe.hasProduct(ingredientName)) recipes.push(recipe);
        }
        return recipes;
    }

    processing = false;
    static async processDelayedCrafting(actors) {
        if (RecipeBook.processing) return;
        RecipeBook.processing = true;
        let soundPlayed = false;
        for (let actor of actors) {
            const delayedCraftings = { ...(actor.flags[MODULE_ID] ?? {}) };
            if (!Object.values(delayedCraftings).length) continue;
            for (const [id, crafting] of Object.entries(delayedCraftings)) {
                const updates = [];
                const create = [];
                if (crafting.time > game.time.worldTime) continue;
                for (const itemData of crafting.items) {
                    const existingItem = actor.items.getName(itemData.name);
                    const itemQuantity = foundry.utils.getProperty(itemData, `system.${MASTERCRAFTED_CONST.QUANTITY}`);
                    if (existingItem) {
                        updates.push({ _id: existingItem.id, [`system.${MASTERCRAFTED_CONST.QUANTITY}`]: foundry.utils.getProperty(existingItem.system, MASTERCRAFTED_CONST.QUANTITY) + itemQuantity });
                    } else {
                        if (crafting.quantityModifier > 1) {
                            itemData.system[MASTERCRAFTED_CONST.QUANTITY] = itemData.system[MASTERCRAFTED_CONST.QUANTITY];
                        }
                        create.push(itemData);
                    }
                }
                await actor.unsetFlag(MODULE_ID, id);
                if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
                if (create.length) await actor.createEmbeddedDocuments("Item", create);
                if (!soundPlayed)
                    foundry.audio.AudioHelper.play({
                        src: `modules/${MODULE_ID}/assets/crafting.ogg`,
                        volume: game.settings.get("core", "globalInterfaceVolume"),
                    });
                soundPlayed = true;
                ui.notifications.notify(game.i18n.localize(`${MODULE_ID}.recipeApp.timedCraftCompleted`) + crafting.items.map((product) => product.name + ` (${foundry.utils.getProperty(product.system, MASTERCRAFTED_CONST.QUANTITY)})`).join(", "));
            }
        }
        RecipeBook.processing = false;
    }

    static async confirmDiscovery(event, message) {
        if (!game.user.isGM) return;
        const buttonEl = event.target;
        const userId = buttonEl.dataset.userId;
        const recipeUuid = buttonEl.dataset.recipeId;
        const recipe = fromUuidSync(recipeUuid);
        const recipeOwnership = { ...recipe.ownership };
        recipeOwnership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        await recipe.update({ ownership: recipeOwnership });
        const bookOwnership = { ...recipe.parent.ownership };
        bookOwnership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        await recipe.parent.update({ ownership: bookOwnership });
        const messageContent = message.content;
        const newContent = messageContent.replace(/<button.*<\/button>/, `<i style="width: 100%; text-align: center;" class="fas fa-check"></i>`).replace(/<p.*<\/p>/, ``);
        await message.update({ content: newContent });
    }

    static getJournal(journalOrUuid) {
        if (typeof journalOrUuid === "string") return game.journal.get(journalOrUuid) ?? fromUuidSync(journalOrUuid);
        return journalOrUuid;
    }

    static isOwner(book) {
        if (game.user.isGM) return true;
        const bookJournal = this.getJournal(book); 
        const userId = game.user.id;
        return bookJournal.ownership[userId] == 1 || bookJournal.ownership[userId] === undefined;
    }

    static toObject(book) {
        book = RecipeBook.getJournal(book);
        if (!book) return null;
        return {
            id: book.id,
            name: book.name,
            description: book.description,
            ownership: book.ownership,
            ...book.flags.mastercrafted,
        };
    }

    static async create(folderId) {
        const newBook = await JournalEntry.create({
            name: "Recipe Book",
            folder: folderId,
            flags: {
                mastercrafted: {
                    img: MASTERCRAFTED_CONST.RECIPE_BOOK.IMG,
                    sound: "",
                    require: "",
                    ingredientsInspection: false,
                    productInspection: false,
                    macroName: "",
                    time: null,
                }
            }
        });
        await RecipeBook.addRecipe(newBook);
        return newBook;
    }

    static edit(uuid) {
        new RecipeBookConfig(uuid).render({ force: true });
    }

    static async addRecipe(book, options = {}) {
        book = RecipeBook.getJournal(book);
        return await Recipe.create(book, options);
    }

    static get(book) {
        book = RecipeBook.getJournal(book);
        return new RecipeBook(bookData);
    }

    static setSelectedComponents(recipeId, ingredientOrProductId, componentId) {
        const oldSetting = game.settings.get(MODULE_ID, "persistentClientSettings");
        let recipeComponents;
        if (componentId) {
            recipeComponents = {
                [recipeId]: {
                    ingredients: {
                        [ingredientOrProductId]: componentId
                    }
                }
            };
        } else {
            recipeComponents = {
                [recipeId]: {
                    products: ingredientOrProductId
                }
            };
        }
        game.settings.set(MODULE_ID, "persistentClientSettings", {
            ...oldSetting,
            selectedComponents: foundry.utils.mergeObject(oldSetting.selectedComponents ?? {}, recipeComponents)
        });
    }

    static isComponentSelected(recipeId, ingredientId, componentId) {
        const recipeComponents = game.settings.get(MODULE_ID, "persistentClientSettings")?.selectedComponents?.[recipeId];
        if (!recipeComponents) return false;
        if (componentId) return recipeComponents.ingredients?.[ingredientId] === componentId;
        return recipeComponents.products === ingredientId;
    }

    static processRecipe(recipe, html) {
        let canCraft = false;
        let ownedIngredients = [];
        for (let ingredient of recipe.ingredients) {
            let ingredientEl = null;
            if (html) ingredientEl = html.querySelector(`[data-ingredient-id="${ingredient.id}"]`);
            const { availableComponents } = ingredient.hasComponents(RecipeBook.inventoryActor);
            let hasOneAvailable = false;
            for (let comp of availableComponents) {
                let componentEl = null;
                if (ingredientEl) componentEl = ingredientEl.querySelector(`[data-component-id="${comp.id}"]`);
                if (componentEl) componentEl.classList.toggle("missing", !comp.available);
                hasOneAvailable = hasOneAvailable || comp.available;
                if (comp.selected && componentEl) componentEl.classList.add("selected"); 
            }
            if (hasOneAvailable) ownedIngredients.push(ingredient);
            if (ingredientEl) hasOneAvailable ? ingredientEl.classList.add("owned") : ingredientEl.classList.add("missing");
        }
        if (ownedIngredients.length === recipe.ingredients.length) canCraft = true;

        let productSelected = false;
        const products = html ? html.querySelectorAll(".mastercrafted-result") : [];
        for (let product of products) {
            if (!canCraft) {
                product.classList.add("missing");
                continue;
            }
            product.style.cursor = "pointer";
            product.addEventListener("click", (event) => {
                products.forEach((product) => product.classList.remove("selected"));
                product.classList.add("selected");
                RecipeBook.setSelectedComponents(recipe.id, product.dataset.resultId);
            });
            if (RecipeBook.isComponentSelected(recipe.id, product.dataset.resultId)) {
                product.classList.add("selected");
                productSelected = true;
            }
        }
        if (!productSelected) {
            products[0]?.classList.add("selected");
        }
        if (!canCraft && html) {
            const createButton = html.querySelector("button.create");
            if (createButton) createButton.disabled = true;
        }
        return canCraft;
    }
}
