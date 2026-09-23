import { MODULE_ID } from "../main.js";
import { MASTERCRAFTED_CONST } from "../config.js";
import { RecipeBook } from "../documents/RecipeBook.js";
import { RecipeBookConfig } from "../apps/RecipeBookConfig.js";
import { Recipe } from "../documents/Recipe.js";
import { ComponentEditForm } from "../apps/ComponentEditForm.js";

export class MastercraftedRecipeSheet extends foundry.applications.sheets.journal.JournalEntryPageProseMirrorSheet {
    constructor(...args) {
        super(...args);
        this._firstRender = true;
        this.isV2 = true;
        this.onAddRollCondition = this._onAddRollCondition.bind(this);
        this.onRemoveRollCondition = this._onRemoveRollCondition.bind(this);
    }

    static get RecipeBook() {
        return RecipeBook;
    }

    static DEFAULT_OPTIONS = {
        actions: {},
        classes: ["text"],
        includeTOC: true,
        position: {
            height: "auto",
        },
        form: {
            handler: this.#onSubmit,
            submitOnChange: true,
            closeOnSubmit: false,
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static EDIT_PARTS = {
        header: super.EDIT_PARTS.header,
        content: {
            classes: ["mastercrafted-config-text"],
            template: "templates/journal/pages/text/edit.hbs"
        },
        config: {
            classes: ["standard-form", "scrollable"],
            scrollable: [""],
            template: "modules/mastercrafted/templates/recipe-config.hbs",
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static VIEW_PARTS = {
        content: {
            // root: true,
            template: "modules/mastercrafted/templates/recipe-sheet-text.hbs"
        },
        recipe: {
            template: "modules/mastercrafted/templates/recipe-sheet.hbs",
        },
    };

    _configureRenderParts(options) {
        const parts = ( this.isView || options.forceView ) ? this.constructor.VIEW_PARTS : this.constructor.EDIT_PARTS;
        return foundry.utils.deepClone(parts);
    }

    async _prepareContentContext(context, options) {
        if ( this.isView || options.forceView ) context.text.enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(context.text.content, {
            relativeTo: this.page,
            secrets: this.page.isOwner
        });
    }
    
    _setupEventListeners(html) {

        // html.querySelector('.add-entry')?.addEventListener('click', this.onAddRollCondition);
        // html.querySelectorAll('.remove-entry').forEach((button) => {
        //     button.addEventListener('click', this.onRemoveRollCondition);
        // });

        // const items = html.querySelectorAll(".gatherer-item");
        // items.forEach((item) => {
        //     item.addEventListener("click", (e) => {
        //         const uuid = item.dataset.uuid;
        //         fromUuid(uuid).then((doc) => {
        //             doc?.sheet?.render(true);
        //         });
        //         return;
        //     });
        // });

        // html.querySelector("#gatherer-reset")?.addEventListener("click", this._onReset.bind(this));
        // html.querySelector("#gatherer-edit")?.addEventListener("click", () => this.document.sheet.render(true));
        // html.querySelector("#gatherer-gather")?.addEventListener("click", this._onGather.bind(this));
    }

    static CLEAN_ARRAYS = ["flags.mastercrafted.modifierList"];

    static async #onSubmit(event, form, formData) {
        const data = this._prepareSubmitData(formData);
        // const data = formData.object;
        const ownership = {};
        Object.keys(data).forEach(key => {
            if (key.startsWith("ownership")) {
                const saneKey = key.replace("ownership.", "");
                ownership[saneKey] = parseInt(data[key]);
            }
        });
        await this.document.update({
            name: data.name,
            category: data.category,
            ownership: ownership,
            text: {
                content: data["text.content"],
            },
            title: {
                level: data["title.level"],
                show: data["title.show"],
            },
            flags: {
                mastercrafted: {
                    img: data.img,
                    sound: data.sound,
                    require: data.require,
                    ingredientsInspection: data.ingredientsInspection,
                    productInspection: data.productInspection,
                    macroName: data.macroName,
                    time: data.time,

                    expression: data.expression,
                    modifierList: data.modifierList,
                    abilityCheck: data.abilityCheck,
                    abilityDc: data.abilityDc,
                    toolCheck: data.toolCheck,
                    toolDc: data.toolDc,
                }
            }
        });
    }

    getToolLabel(key, item) {
        if (typeof item == "string") {
            const name = fromUuidSync(item)?.name;
            if (name) return name;
            return item;
        }
        const name = fromUuidSync(item?.id)?.name;
        if (name) return name;
        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    _prepareSubmitData(formData) {
        const submitData = formData.object;
        const modifierList = Object.entries(submitData).reduce((acc, [key, val]) => {
            const parts = key.split('.');
            const index = parseInt(parts.at(-2));
            const field = parts.at(-1);
            acc[index] = acc[index] || {};
            acc[index][field] = val;
            return acc;
        }, []);
        foundry.utils.setProperty(submitData, "modifierList", modifierList.sort((a, b) => b.DC - a.DC));
        return submitData;
    }

    async _onAddRollCondition(event) {
        const currentList = this.document.getFlag("mastercrafted", "modifierList") ?? [];
        currentList.push({ modifier: "", DC: undefined });

        this.document.setFlag("mastercrafted", "modifierList", currentList);
    }

    async _onRemoveRollCondition(event) {
        const index = Number(event.currentTarget.dataset.index);
        const currentList = this.document.getFlag("mastercrafted", "modifierList") ?? [];

        currentList.splice(index, 1);
        this.document.setFlag("mastercrafted", "modifierList", currentList);
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);

        this.recipe = new Recipe({
            ...this.document.flags.mastercrafted,
            document: this.document,
            pageUuid: this.document.uuid,
            pageId: this.document.id,
            id: this.document.id,
            name: this.document.name,
            recipeBook: RecipeBook.toObject(this.document.parent),
        })

        let maxCraftableProductsAmount = Infinity;
        if (this.recipe.ingredients.length === 0) {
            maxCraftableProductsAmount = 0;
        }
        else {
            for (let ingredient of this.recipe.ingredients) {
                const { maxCraftableProducts } = ingredient.hasComponents(RecipeBook.inventoryActor);
                maxCraftableProductsAmount = Math.min(maxCraftableProductsAmount, maxCraftableProducts);
            }
        }

        const perm = { ...MASTERCRAFTED_CONST.CONFIG.PERMISSION_CHOICES };

        switch(partId) {
            case "config": {
                context.users = Array.from(game.users).filter(u => !u.isGM).map((u) => {
                    return {
                        id: u.id,
                        name: u.name,
                        permission: this.recipe ? this.recipe.ownership[u.id] : 0,
                        choices: perm
                    };
                })
                break;
            }
        }

        context.actors = game.actors.reduce((acc, actor) => {
            if (!actor.isOwner) return acc;
            acc[actor.id] = actor.name;
            return acc;
        }, {});
        context.inventoryActors = {
            "useCraftingActor": game.i18n.localize("mastercrafted.recipeApp.useCraftingActor"),
            ...context.actors,
        }
        context.actor = RecipeBook.actor?.id;
        context.inventoryActor = game.settings.get(MODULE_ID, "persistentClientSettings")?.inventoryActor || "useCraftingActor";

        const systemData = Recipe.getSystemData();
        if (systemData) {
            const tools = {
                ...CONFIG.DND5E.toolProficiencies,
                ...CONFIG.DND5E.vehicleTypes,
                ...Object.entries(CONFIG.DND5E.tools).reduce((acc, [key, item]) => {
                    acc[key] = this.getToolLabel(key, item);
                    return acc;
                }, {}),
            };

            Object.assign(context, {
                ...systemData, 
                systemData: true,
                tools,
            });
        }

        const flags = this.document.flags.mastercrafted ?? {};

        Object.assign(context, { 
            recipe: this.recipe,
            ...flags,
            perm,
            editMode: this.editMode,
            craftMode: !this.editMode,
            isOwner: this.document.isOwner,
            maxCraftableProducts: maxCraftableProductsAmount,
        });

        return context;
    }

    get editMode() {
        return RecipeBook.editMode && this.document.isOwner;
    }

    #listeners = null;

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        html.querySelector('.add-entry')?.addEventListener('click', this.onAddRollCondition);
        html.querySelectorAll('.remove-entry').forEach((button) => {
            button.addEventListener('click', this.onRemoveRollCondition);
        });

        if (!this.isView) return;

        new foundry.applications.ux.DragDrop.implementation({
            dropSelector: ".mastercrafted-ingredient, .mastercrafted-result",
            permissions: {
                drop: () => this.editMode,
            },
            callbacks: {
                drop: this._onDrop.bind(this),
            }
        }).bind(this.element);

        if (this.editMode) {
            new foundry.applications.ux.ContextMenu.implementation(html.querySelector(".mastercrafted-recipe"), ".mastercrafted-component.component-img", [
                {
                    name: `${MODULE_ID}.recipeApp.bookcontext.inspect`,
                    icon: `<i class="fas fa-eye"></i>`,
                    callback: async (el) => {
                        const uuid = el.dataset.uuid;
                        const item = await fromUuid(uuid);
                        item?.sheet.render(true);
                    },
                },
                {
                    name: `${MODULE_ID}.recipeApp.bookcontext.edit`,
                    icon: `<i class="fas fa-edit"></i>`,
                    condition: (el) => el.closest(".mastercrafted-ingredient"),
                    callback: async (el) => {
                        const ingredientId = el.closest(".mastercrafted-ingredient").dataset.ingredientId;
                        const componentId = el.dataset.componentId;
                        const ingredient = this.recipe.getIngredient(ingredientId);
                        if (!ingredient) return;
                        const component = ingredient.getComponent(componentId);
                        if (!component) return;
                        new ComponentEditForm(component, this.document).render(true);
                    },
                },
                {
                    name: `${MODULE_ID}.recipeApp.bookcontext.delete`,
                    icon: `<i class="fas fa-trash"></i>`,
                    callback: async (el) => {
                        const ingredientEl = el.closest(".mastercrafted-ingredient");
                        const productEl = el.closest(".mastercrafted-result");
                        if (ingredientEl) {
                            const ingredientId = ingredientEl?.dataset?.ingredientId;
                            const componentId = el?.dataset?.componentId;
                            this.recipe.removeComponent(ingredientId, componentId);
                        }
                        if (productEl) {
                            const productId = productEl?.dataset?.resultId;
                            const componentId = el?.dataset?.componentId;
                            this.recipe.removeProduct(productId, componentId);
                        }
                    },
                },
            ], {jQuery: false, fixed: true});

        }

        this.#listeners?.abort();
        this.#listeners = new AbortController();
        const signal = this.#listeners.signal;

        html.addEventListener("click", this._onClick.bind(this), { signal });

        html.querySelectorAll(".mastercrafted-ingredient:has(.empty-ingredient), button[data-action='add-component']").forEach((el) => {
            el.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                const ingredientId = el.closest(".mastercrafted-ingredient").dataset.ingredientId || "";
                const { ingredient, component } = await this.recipe.addComponent(ingredientId, "", game.i18n.localize("mastercrafted.recipeApp.component"), "icons/commodities/materials/powder-grey.webp", []);
                if (!component) return;
                new ComponentEditForm(component, this.document).render(true);
            });
        });

        html.querySelectorAll(".mastercrafted-ingredient .mastercrafted-component.component-img").forEach((component) => {
            const ingredientId = component.closest(".mastercrafted-ingredient").dataset.ingredientId;
            const componentId = component.dataset.componentId;
            const uuid = component.dataset.uuid;
            const ingredientEl = component.closest(".mastercrafted-ingredient");

            component.addEventListener("click", async (event) => {
                if (this.editMode) return;
                if (!component.classList.contains("missing")) {
                    ingredientEl.querySelectorAll(".mastercrafted-component").forEach((c) => c.classList.remove("selected"));
                    component.classList.add("selected");
                    RecipeBook.setSelectedComponents(this.recipe.id, ingredientId, componentId);
                    if (RecipeBook.actor && !this.editMode) RecipeBook.processRecipe(this.recipe, this.element);
                    this.render();
                }
            });

            component.addEventListener("contextmenu", async (event) => {
                if (this.editMode) return;
                if (event.target != component) return;
                const canInspect = this.recipe.canInspectIngredients;
                if (!canInspect) return;
                event.preventDefault();
                const item = await fromUuid(uuid);
                if (!item) return;

                // Mastercrafted may allow inspection even when the source Item itself
                // is not visible to the player. Render a temporary read-only-capable
                // copy for that player without changing the real Item permissions.
                if (game.user.isGM || item.testUserPermission?.(game.user, "OBSERVER")) {
                    item.sheet.render(true);
                    return;
                }
                const data = item.toObject();
                data.ownership = { default: 0, [game.user.id]: 3 };
                const preview = new CONFIG.Item.documentClass(data, { parent: null });
                preview.sheet.render(true);            
            });

            if (!this.editMode) return;

            component.querySelector("input")?.addEventListener("change", async (event) => {
                const quantity = event.target.value;
                this.recipe.updateComponentQuantity(ingredientId, componentId, quantity);
            });
        });

        html.querySelectorAll(".mastercrafted-result .mastercrafted-component.component-img").forEach((component) => {
            const resultId = component.closest(".mastercrafted-result").dataset.resultId;
            const componentId = component.dataset.componentId;
            const uuid = component.dataset.uuid;

            component.addEventListener("contextmenu", async (event) => {
                if (this.editMode) return;
                if (event.target != component) return;
                const canInspect = this.recipe.canInspectProducts;
                if (!canInspect) return;
                event.preventDefault();
                const item = await fromUuid(uuid);
                if (!item) return;

                // Mastercrafted may allow inspection even when the source Item itself
                // is not visible to the player. Render a temporary read-only-capable
                // copy for that player without changing the real Item permissions.
                if (game.user.isGM || item.testUserPermission?.(game.user, "OBSERVER")) {
                    item.sheet.render(true);
                    return;
                }
                const data = item.toObject();
                data.ownership = { default: 0, [game.user.id]: 3 };
                const preview = new CONFIG.Item.documentClass(data, { parent: null });
                preview.sheet.render(true);
            });

            if (!this.editMode) return;

            component.querySelector("input").addEventListener("change", async (event) => {
                const quantity = event.target.value;
                this.recipe.updateProductQuantity(resultId, componentId, quantity);
            });
        });

        html.querySelector("select[name='actors']")?.addEventListener("change", async (event) => {
            const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
            game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, actor: event.target.value });
            this.render();
        });

        html.querySelector("select[name='inventoryActors']")?.addEventListener("change", async (event) => {
            const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
            game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, inventoryActor: event.target.value });
            this.render();
        });

        html.querySelector("input[name='editMode']")?.addEventListener("change", async (event) => {
            const editMode = event.target.checked;
            const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
            game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, editMode });
            this.render();
        });

        if (RecipeBook.actor && !this.editMode) RecipeBook.processRecipe(this.recipe, this.element);
    }

    _onClose() {
        this.#listeners?.abort();
        this.#listeners = null;
    }

    async _onClick(event) {
        const action = event.target.dataset.action;
        if (!action) return;
        switch (action) {
            case "createBook":
                this._createBook();
                break;
            case "toggle-recipe":
                this._toggleRecipe(event.target.closest(".recipe").dataset.recipeId);
                break;
            case "craft":
                const data = {
                    ingredients: {},
                    productId: "",
                };
                const recipeEl = event.target.closest(".journal-entry-page").querySelector(".mastercrafted-recipe");
                const ingredientsEls = recipeEl.querySelectorAll(".mastercrafted-ingredient");
                for (const ingredientEl of ingredientsEls) {
                    const ingredientId = ingredientEl.dataset.ingredientId;
                    const selectedComponent = ingredientEl.querySelector(".mastercrafted-component.selected");
                    data.ingredients[ingredientId] = selectedComponent.dataset.componentId;
                }
                data.productId = recipeEl.querySelector(".mastercrafted-result.selected").dataset.resultId;
                event.target.disabled = true;
                await this.recipe.craft(RecipeBook.actor, RecipeBook.inventoryActor, data, event.ctrlKey);
                event.target.disabled = false;
                break;
        }
    }

    async _onDrop(event) {
        const ingredientProductClosest = event.target.closest(".mastercrafted-ingredient, .mastercrafted-result");
        const isIngredient = ingredientProductClosest?.classList.contains("mastercrafted-ingredient");
        const isProduct = ingredientProductClosest?.classList.contains("mastercrafted-result");
        if (!isIngredient && !isProduct) return;
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return false;
        }
        if (!data.type === "Item") return;
        const ingredientId = ingredientProductClosest.dataset.ingredientId;
        const productId = ingredientProductClosest.dataset.resultId;
        const recipe = this.recipe;
        const item = await fromUuid(data.uuid);
        if (isIngredient) {
            const tags = item.flags?.mastercrafted?.tags ?? [];
            recipe.addComponent(ingredientId, data.uuid, item.name, item.img, tags);
        }
        if (isProduct) {
            recipe.addProduct(productId, data.uuid, item.name, item.img);
        }
    }

    _onToggleRecipe(event) {
        const bookEl = event.currentTarget.closest(".recipe-book");
        bookEl.classList.toggle("expanded");
    }

    _toggleRecipe(recipeId) {
        const recipies = this.element.querySelectorAll(".mastercrafted-recipe");
        for (let recipe of recipies) {
            recipe.classList.toggle("hidden", recipe.dataset.recipeId !== recipeId);
        }
    }

    async _createBook() {
        new RecipeBookConfig().render(true);
    }

    async _sortAndSave(e) {
        let currentBooks = game.settings.get(MODULE_ID, "recipeBooks");
        const html = this.element;
        const bookEls = html.querySelectorAll(".recipe-book");
        const bookIds = Array.from(bookEls).map((book) => book.dataset.bookId);
        for (let bookEl of bookEls) {
            const bookId = bookEl.dataset.bookId;
            const recipeEls = bookEl.querySelectorAll(".recipe");
            const recipeIds = Array.from(recipeEls).map((recipeEl) => recipeEl.dataset.recipeId);
            let book = currentBooks.find((book) => book.id === bookId);
            let bookRecipies = book.recipes;
            let sortedRecipes = recipeIds.map((recipeId) => bookRecipies.find((recipe) => recipe.id === recipeId));
            book.recipes = sortedRecipes;
        }
        let sortedBooks = bookIds.map((bookId) => currentBooks.find((book) => book.id === bookId));
        currentBooks = sortedBooks;
        game.settings.set(MODULE_ID, "recipeBooks", currentBooks);
    }
}

export function cleanIdsRecursive(object) {
    if (!object) return;
    if (object.id) delete object.id;
    for (let [key, value] of Object.entries(object)) {
        if (typeof value === "array") {
            for (let item of value) {
                cleanIdsRecursive(item);
            }
        }
    }
    for (let key in object) {
        if (typeof object[key] === "object") {
            cleanIdsRecursive(object[key]);
        }
    }
    return object;
}
