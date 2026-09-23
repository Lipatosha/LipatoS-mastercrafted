import { MODULE_ID } from "../main.js";
import { MASTERCRAFTED_CONST } from "../config.js";
import { RecipeBook } from "../documents/RecipeBook.js";
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

export class CauldronApp extends HandlebarsApplication {
    constructor() {
        super();
        this.actor = RecipeBook.inferredActor;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            id: this.APP_ID,
            window: {
                title: `${MODULE_ID}.cauldronApp.title`,
                contentClasses: ["standard-form"],
            },
            form: {
                handler: this.#onSubmit,
                closeOnSubmit: true,
            }
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/${MODULE_ID}/templates/${this.APP_ID}.hbs`,
                classes: ["standard-form", "scrollable", "mastercrafted-cauldron-app"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            }
        };
    }

    _prepareContext(options) {
        const mixButton = {
            type: "submit",
            action: "submit",
            icon: "fas fa-cauldron",
            label: "Mix Ingredients",
        };

        return { buttons: [mixButton] }
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
        new foundry.applications.ux.DragDrop.implementation({
            dropSelector: ".ingredients-container",
            callbacks: {
                drop: this._onDrop.bind(this)
            }
        }).bind(this.element);
    }

    async _updateObject() {}

    static async #onSubmit(event) {
        event.preventDefault();
        const itemsData = Array.from(this.element.querySelectorAll(".ingredients-container .cauldron-ingredient")).map((el) => el.dataset.uuid);
        if (itemsData.length < 2) return ui.notifications.error(game.i18n.localize(`${MODULE_ID}.cauldronApp.noIngredients`));
        const items = await Promise.all(
            itemsData.map(async (uuid) => {
                const itemDoc = await fromUuid(uuid);
                if (!itemDoc) return null;
                return itemDoc;
            }),
        );
        await this.brew(items);
    }

    async _onDrop(event) {
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return false;
        }
        if (!data.type === "Item") return;
        const item = await fromUuid(data.uuid);
        if (!item || !item.parent || item.parent !== this.actor) return;

        const container = event.currentTarget;
        const hasItem = container.querySelector(`[data-uuid="${data.uuid}"]`);
        if (hasItem) return;
        const placeholder = container.querySelector(".placeholder-item");
        if (placeholder) placeholder.remove();
        const img = item.img;
        const itemElement = document.createElement("div");
        itemElement.classList.add("cauldron-ingredient");
        itemElement.style.backgroundImage = `url(${img})`;
        itemElement.setAttribute("data-uuid", data.uuid);
        itemElement.setAttribute("data-name", item.name);
        itemElement.addEventListener("click", (e) => {
            itemElement.remove();
        });

        container.appendChild(itemElement);
    }

    async brew(ingredients) {
        const consumed = await this.consume(ingredients);
        if (!consumed) return this._onBrewFail();
        this.element.querySelector("button").disabled = true;
        let topMatch = { recipe: null, matchCount: 0 };
        let erroredOut = false;
        try {
            const matchedRecipes = Array.from(
                new Set(
                    ingredients
                        .map((i) => RecipeBook.getRecipesByIngredient(i.name))
                        .flat()
                        .filter((r) => {
                            if (game.user.isGM) return true;
                            if (!r.document) return false;
                            if (!r.document.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER &&
                                !r.document.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER))) return true;
                            return false;
                        }),
                ),
            );
            const ingredientsNames = ingredients.map((i) => i.name);
            const matches = matchedRecipes.map((recipe) => {
                let matchCount = 0;
                recipe.ingredients.forEach((i) => {
                    const componentsMatch = i.components.find((c) => ingredientsNames.includes(c.name));
                    if (componentsMatch) matchCount++;
                });
                return {recipe, matchCount, matchCloseness: recipe.ingredients.length - matchCount, extraCount: ingredientsNames.length - matchCount};
            });
            const minCloseness = Math.min(...matches.map((m) => m.matchCloseness));
            const topMatches = matches.filter((m) => m.matchCloseness === minCloseness);
            const minExtraCount = Math.min(...topMatches.map((m) => m.extraCount));
            topMatch = topMatches.find((m) => m.extraCount === minExtraCount);
        } catch (error) {
            erroredOut = true;
        }
        const recipe = topMatch?.recipe;
        if (!recipe) erroredOut = true;

        let extraCount = 0;
        let missingCount = 0;
        let matchScore = 999;

        if (recipe) {
            const extraIngredients = ingredients.filter((i) => !recipe.hasComponent(i.name));
            let missingIngredients = [];
            recipe.ingredients.forEach((i) => {
                const isSatisfied = ingredients.some((ing) => i.hasComponent(ing.name));
                if (!isSatisfied) missingIngredients.push(i);
            });

            extraCount = extraIngredients.length;
            missingCount = missingIngredients.length;
            matchScore = extraCount + missingCount;
        }

        this.element.querySelector(".ingredients-container").innerHTML = `<i style="font-size: 5rem" class="fa-duotone fa-cauldron fa-shake"></i>`;
        const shakes = Math.max(1, 4 - matchScore);
        for (let i = 0; i < shakes; i++) {
            const sound = Math.floor(Math.random() * 3) + 1;
            foundry.audio.AudioHelper.play({
                src: `modules/${MODULE_ID}/assets/cauldron/bubble${sound}.ogg`,
                volume: game.settings.get("core", "globalInterfaceVolume"),
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        this.element.querySelector(".ingredients-container").innerHTML = "";
        this.element.querySelector("button").disabled = false;

        if (erroredOut) return this._onBrewFail();
        if (matchScore === 0) return this._onBrewSuccess(recipe);
        if (matchScore > 2) return this._onBrewFail();
        return this._onBrewPartial(extraCount, missingCount, ingredients);
    }

    async consume(ingredients) {
        const itemsToUpdate = [];
        const itemsToDelete = [];
        for (const ingredient of ingredients) {
            const quantity = foundry.utils.getProperty(ingredient.system, MASTERCRAFTED_CONST.QUANTITY);
            if (quantity <= 0) return false;
            if (quantity > 1) itemsToUpdate.push({ _id: ingredient.id, [`system.${MASTERCRAFTED_CONST.QUANTITY}`]: quantity - 1 });
            else itemsToDelete.push(ingredient.id);
        }
        await this.actor.deleteEmbeddedDocuments("Item", itemsToDelete);
        await this.actor.updateEmbeddedDocuments("Item", itemsToUpdate);
        return true;
    }

    _onBrewFail() {
        ui.notifications.error(game.i18n.localize(`${MODULE_ID}.cauldronApp.brewFail`));
    }

    async _onBrewSuccess(recipe) {
        ChatMessage.create({
            content: await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/brew-chat.hbs`, { recipe, userId: game.user.id, success: true }),
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            whisper: [game.user.id, ...game.users.filter((u) => u.isGM).map((u) => u.id)],
        });
    }

    async _onBrewPartial(extra, missing, ingredients) {
        let messageKey;
        if (extra == 2) {
            messageKey = "extra2";
        } else if (missing == 2) {
            messageKey = "missing2";
        } else if (extra == 1 && missing == 1) {
            messageKey = "extra1missing1";
        } else if (extra == 1) {
            messageKey = "extra1";
        } else if (missing == 1) {
            messageKey = "missing1";
        }

        const message = game.i18n.localize(`${MODULE_ID}.cauldronApp.partial.${messageKey}`);

        ChatMessage.create({
            content: await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/brew-chat.hbs`, { message, ingredients, userId: game.user.id, success: false }),
            speaker: ChatMessage.getSpeaker({ actor: RecipeBook.actor }),
            whisper: [game.user.id, ...game.users.filter((u) => u.isGM).map((u) => u.id)],
        });
    }
}
