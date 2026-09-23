import { MODULE_ID } from "../main.js";
import { Ingredient, Product } from "./Ingredient.js";
import { MASTERCRAFTED_CONST } from "../config.js";
import { MastercraftedRecipeSheet } from "../journal/RecipeSheet.js";
import { RecipeBook } from "./RecipeBook.js";
import { mergeClone, deepClone, getProperty, setProperty } from "../lib/utils.js";

export class Recipe {
    constructor({ id = null, document = null, pageId = null, pageUuid = null, recipeBook = null, sound = "", ingredientsInspection = null, productInspection = null, time = null, name = "", macroName = "", description = "", ownership = {}, ingredients = [], products = [], require = [], toolCheck = null, toolDc = null, abilityCheck = null, abilityDc = null, expression = "", modifierList = [], img = MASTERCRAFTED_CONST.RECIPE.IMG }) {
        this.id = id ?? foundry.utils.randomID();
        this.name = name;
        this.time = time || recipeBook.time || 0;
        this.macroName = macroName;
        this.documentName = "Recipe";
        this.recipeBook = recipeBook;
        this.ownership = ownership;
        this.sound = sound;
        this.ingredientsInspection = ingredientsInspection;
        this.productInspection = productInspection;
        this.description = description;
        this.ingredients = ingredients.map((ingredient) => new Ingredient({ ...ingredient, recipe: this }));
        this.products = products.map((product) => new Product({ ...product, recipe: this }));
        
        this.require = require.length ? require : "";
        this.toolCheck = toolCheck;
        this.toolDc = toolDc;
        this.abilityCheck = abilityCheck;
        this.abilityDc = abilityDc;
        this.expression = expression;
        this.modifierList = modifierList;

        this.img = img || MASTERCRAFTED_CONST.RECIPE.IMG;
        this.pageId = pageId;
        this.pageUuid = pageUuid;
        this.document = document;
    }

    static getDefaultData(bookId) {
        return {
            name: "Recipe",
            type: "mastercrafted.mastercrafted",
            text: {
                content: `<p></p>`,
                format: 1
            },
            flags: this.getDefaultFlags(bookId),
        };
    }

    static getDefaultFlags(bookId) {
        return {
            mastercrafted: {
                recipeBook: bookId ?? null,
                img: "",
                ingredients: [],
                ingredientsInspection: false,        
                macroName: "",
                products: [],
                productInspection: false,
                sound: "",
                time: null,

                require: "",
                toolDc: null,
                toolCheck: null,
                abilityCheck: null,
                abilityDc: null,
                expression: "",
                modifierList: [],
            }
        }
    }

    get REQUIRE() {
        const bookRequire = this.recipeBook.require?.split(",")
            .map((tool) => tool.trim())
            .filter((tool) => tool !== "") ?? [];
        const recipeRequire = this.require?.split(",")
            .map((tool) => tool.trim())
            .filter((tool) => tool !== "") ?? [];
        const requireToCheck = bookRequire.concat(recipeRequire);
        return requireToCheck;
    }

    get EXPRESSION() {
        const macroExpression = game.macros.getName(this.expression)?.command;
        return macroExpression ?? this.expression ?? false;
    }

    get QUANTITY() {
        return 1;
    }
    
    static getSystemData() {
        switch (game.system.id) {
            case "dnd5e":
                let abil = {};
                let skills = {};
                for (let [k, v] of Object.entries(game.dnd5e.config.skills)) {
                    skills[k] = v.label;
                }
                for (let [k, v] of Object.entries(game.dnd5e.config.abilities)) {
                    abil[k] = v.label;
                }
                const data = foundry.utils.mergeObject(foundry.utils.deepClone(abil), foundry.utils.deepClone(skills));
                return { systemSelect: data };
            default:
                return null;
        }
    }

    get supportedSystem() {
        return Recipe.getSystemData() != null;
    }

    get craftingSound() {
        return this.sound || this.recipeBook.sound || `modules/${MODULE_ID}/assets/crafting.ogg`;
    }

    get isOwner() {
        if (game.user.isGM) return true;
        const userId = game.user.id;
        if (this.ownership[userId] == 0 || !this.ownership[userId]) return this.recipeBook.isOwner;
        return this.ownership[userId] == 1;
    }

    get canInspectIngredients() {
        if (game.user.isGM) return true;
        if (this.ingredientsInspection == 0 || !this.ingredientsInspection) return this.recipeBook.ingredientsInspection == 1;
        return this.ingredientsInspection == 1;
    }

    get canInspectProducts() {
        if (game.user.isGM) return true;
        if (this.productInspection == 0 || !this.productInspection) return this.recipeBook.productInspection == 1;
        return this.productInspection == 1;
    }

    getToolLabelFromKey(key) {
        if (key in CONFIG.DND5E.toolProficiencies) return CONFIG.DND5E.toolProficiencies[key];
        if (key in CONFIG.DND5E.vehicleTypes) return CONFIG.DND5E.vehicleTypes[key];
        if (key in CONFIG.DND5E.tools) {
            const item = CONFIG.DND5E.tools[key];
            if (typeof item == "string") {
                const name = fromUuidSync(item)?.name;
                if (name) return name;
                return item;
            }
            const name = fromUuidSync(item?.id)?.name;
            if (name) return name;
        }
        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    static async create(book, options = {}) {
        const page = await book.createEmbeddedDocuments("JournalEntryPage", [mergeClone(Recipe.getDefaultData(book.id), options)]);
        if (page.length === 0) return null;
        return page[0];
    }

    async craft(actor, inventoryActor, data, skipConfirm) {

        if (!this.hasRequire(actor, inventoryActor)) {
            return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.recipeApp.noTools`) + this.REQUIRE.join(", "));
        }

        const componentsToConsume = [];
        for (let [k, v] of Object.entries(data.ingredients)) {
            const component = this.getIngredient(k).getComponent(v);
            componentsToConsume.push(component);
        }
        const product = this.getProduct(data.productId);

        return skipConfirm ? this._craft(actor, inventoryActor, componentsToConsume, product) : this.craftPrompt(actor, inventoryActor, componentsToConsume, product);
    }

    async craftPrompt(actor, inventoryActor, componentsToConsume, product) {
        let content = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/crafting-prompt.hbs`, { componentsToConsume, product });
        content = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
        new foundry.applications.api.DialogV2({
            window: { title: `${MODULE_ID}.craftDialog.title` },
            position: {
                width: 500,
            },
            content: content,
            buttons: [
                {
                    label: `${MODULE_ID}.craftDialog.craft`,
                    icon: "fas fa-hammer",
                    action: "craft",
                    callback: () => this._craft(actor, inventoryActor, componentsToConsume, product),
                },
                {
                    label: `${MODULE_ID}.craftDialog.cancel`,
                    icon: "fas fa-times",
                    action: "cancel",
                    callback: () => { },
                }
            ],
            default: "craft",
        }).render({ force: true });
    }

    async _craft(actor, inventoryActor, componentsToConsume, product) {
        const updates = [];
        const actorUpdates = {};
        const toDelete = [];
        const productData = [];
        for (const component of product.components) {
            const item = await component.getItem();
            const itemData = item?.toObject();
            if(itemData) setProperty(itemData.system, MASTERCRAFTED_CONST.QUANTITY, parseFloat(component.quantity));
            productData.push(itemData);
        }
        let check = await this._executeMacro(actor, inventoryActor, componentsToConsume, product, productData);
        const itemConsumedQuantity = {};
        for (let component of this.mergeComponents(componentsToConsume)) {
            
            const resourcePath = component.resourcePath;
            
            if (resourcePath) {
                const actorResource = resourcePath ? parseFloat(getProperty(inventoryActor.system, resourcePath)) || 0 : 0;
                if (actorResource < component.quantity) {
                    return this._onCraftError(component.name + " Not Enough");
                }
                actorUpdates[`system.${resourcePath}`] = actorResource - component.quantity;
                continue;
            }
                
            const nameItem = inventoryActor.items.find(item => {
                if (item.name === component.name) return item;
                if (!component.uuid || !item.flags?.core?.sourceId) return undefined;
                if (item.flags?.core?.sourceId === component.uuid) return item;
            });
            const nameItemQuantity = nameItem ? parseFloat(getProperty(nameItem.system, MASTERCRAFTED_CONST.QUANTITY)) : 0;
            const tags = component.tags;
            const tagItems = tags?.length !== 0 ? inventoryActor.items.filter((item) => component.hasTags(item)).filter((item) => !toDelete.includes(item.id)).filter((item) => item.id !== nameItem?.id) : [];

            let quantityToConsume = component.quantity;
            const totalQuantity =  nameItemQuantity + tagItems.reduce((total, item) => total + parseFloat(getProperty(item.system, MASTERCRAFTED_CONST.QUANTITY), 0), 0);
            if (totalQuantity < quantityToConsume) return this._onCraftError(component.name + " Not Enough");
            
            if (nameItem) {
                if (nameItemQuantity - quantityToConsume <= 0) {
                    quantityToConsume -= nameItemQuantity;
                    toDelete.push(nameItem.id);
                } else {
                    updates.push({ _id: nameItem.id, [`system.${MASTERCRAFTED_CONST.QUANTITY}`]: nameItemQuantity - quantityToConsume });
                    continue;
                }
            }
            if (tags.length) {
                for (const item of tagItems) {
                    const quantity = itemConsumedQuantity[item.id] ?? parseFloat(getProperty(item.system, MASTERCRAFTED_CONST.QUANTITY));
                    if (quantity - quantityToConsume <= 0) {
                        quantityToConsume -= quantity;
                        toDelete.push(item.id);
                        delete itemConsumedQuantity[item.id];
                    } else {
                        itemConsumedQuantity[item.id] = quantity - quantityToConsume;
                        updates.push({ _id: item.id, [`system.${MASTERCRAFTED_CONST.QUANTITY}`]: quantity - quantityToConsume });
                        break;
                    }
                }
            }
        }

        if (check.success && this.toolCheck && this.toolDc) {
            const item = actor.system?.tools?.[this.toolCheck];
            if (!item) {
                ui.notifications.error(game.i18n.localize("mastercrafted.recipeApp.noProficiency") + this.getToolLabelFromKey(this.toolCheck));
                return false;
            }
        }
        let rolledDC = check.checkResult ?? 0;
        if (check.success && this.supportedSystem && this.abilityCheck && this.abilityDc) {
            let result;
            if (game.dnd5e.config.abilities[this.abilityCheck]) {
                result = await actor.rollAbilityCheck({ ability: this.abilityCheck }, {});
            } else {
                result = await actor.rollSkill({ skill: this.abilityCheck }, {});
            }
            result = result ? result[0] : { total: 0 };
            if (result.total < this.abilityDc) {
                ui.notifications.error(game.i18n.localize("mastercrafted.recipeApp.craftFailConsumed"));
                check = { success: false, consume: true };
            }
            rolledDC = result.total;
        }
        if (check.success && this.supportedSystem && this.toolCheck && this.toolDc) {
            const item = actor.system?.tools?.[this.toolCheck];
            const systemTool = actor.system.tools[this.toolCheck];
            if (item || systemTool) {
                const roll = systemTool ? await actor.rollToolCheck({ tool: this.toolCheck }, {}) : await item.rollToolCheck({});
                if (!roll) return;
                if (roll[0].total < this.toolDc) {
                    ui.notifications.error(game.i18n.localize("mastercrafted.recipeApp.craftFailConsumed"));
                    check = { success: false, consume: true };
                }
                rolledDC = roll[0].total;
            }
        }

        const evaluateExpression = async (quantity) => {
            const expression = (rolledDC == undefined ? undefined : this.modifierList.find(m => rolledDC >= m.DC)?.modifier) || "0";
            let processedExpression = Number.isFinite(parseInt(expression[0])) ? `+${expression}` : expression;
            if (!processedExpression.includes("$")) processedExpression = `$${processedExpression}`;
            
            const quantityRoll = await new Roll(processedExpression.replaceAll("$", quantity), actor).roll();
            return quantityRoll.total;
        }


        if (!check.success) {
            if (!check.consume) {
                ui.notifications.error(game.i18n.localize(`${MODULE_ID}.recipeApp.craftFailNotConsumed`));
                return;
            }
            await inventoryActor.updateEmbeddedDocuments("Item", updates);
            await inventoryActor.deleteEmbeddedDocuments("Item", toDelete);
            await inventoryActor.update(actorUpdates);
            ui.notifications.element?.empty();
            ui.notifications.error(game.i18n.localize(`${MODULE_ID}.recipeApp.craftFailConsumed`));
            return;
        }

        const products = [];
        const timedCraft = [];
        const processedTime = this.time * (check.timeMultiplier ?? 1);

        if (processedTime) {
            for (let component of product.components) {
                const item = productData[product.components.indexOf(component)];
                if (!item) return this._onCraftError("Item Not Found");
                const processedQuantity = await evaluateExpression(parseFloat(getProperty(item.system, MASTERCRAFTED_CONST.QUANTITY)));
                setProperty(item.system, MASTERCRAFTED_CONST.QUANTITY, processedQuantity);
                timedCraft.push(item);
            }
        } else {
            for (let component of product.components) {
                const item = productData[product.components.indexOf(component)];
                if (!item) return this._onCraftError("Item Not Found");
                const existingItem = inventoryActor.items.getName(item.name);
                const processedQuantity = await evaluateExpression(parseFloat(getProperty(item.system, MASTERCRAFTED_CONST.QUANTITY)));
                setProperty(item.system, MASTERCRAFTED_CONST.QUANTITY, processedQuantity);
                if (existingItem) {
                    const existingQuantity = parseFloat(getProperty(existingItem.system, MASTERCRAFTED_CONST.QUANTITY));
                    updates.push({ _id: existingItem.id, [`system.${MASTERCRAFTED_CONST.QUANTITY}`]: existingQuantity + processedQuantity });
                } else {
                    products.push(item);
                }
            }
        }
        await inventoryActor.updateEmbeddedDocuments("Item", updates);
        await inventoryActor.createEmbeddedDocuments("Item", products);
        await inventoryActor.deleteEmbeddedDocuments("Item", toDelete);
        await actor.update(actorUpdates);
        if (timedCraft.length > 0) {
            await inventoryActor.setFlag(MODULE_ID, foundry.utils.randomID(), { time: game.time.worldTime + processedTime * 60, items: timedCraft });
        }
        foundry.audio.AudioHelper.play({
            src: this.craftingSound,
            volume: game.settings.get("core", "globalInterfaceVolume"),
        });
        ui.notifications.clear();
        const chatProduct = {
            components: product.components.map(component => component.clone({ quantity: getProperty(productData.find(p => p.name === component.name)?.system ?? {}, MASTERCRAFTED_CONST.QUANTITY) ?? component.quantity}))
        };
        // for (const component of product.components) {
        //     chatProduct.components.push(component.clone())
        //     component.quantity = getProperty(productData.find(p => p.name === component.name)?.system ?? {}, MASTERCRAFTED_CONST.QUANTITY) ?? component.quantity;
        // }
        ui.notifications.notify(game.i18n.localize(processedTime ? `${MODULE_ID}.recipeApp.craftSuccessTimed` : `${MODULE_ID}.recipeApp.craftSuccess`) + chatProduct.components.map((product) => product.name + ` (${product.quantity})`).join(", "));
        this._postToChat(actor, componentsToConsume, chatProduct);
    }

    mergeComponents(components) {
        const merged = [];
        for (let component of components) {
            const existing = merged.find((mergedComponent) => mergedComponent.name == component.name);
            if (existing) {
                existing.quantity += parseFloat(component.quantity);
            } else {
                merged.push(component);
            }
        }
        return merged;
    }

    async _postToChat(actor, componentsToConsume, product) {
        let content = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/crafting-chat.hbs`, { componentsToConsume, product, rName: this.name, recipe: this });
        content = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
        ChatMessage.create(
            ChatMessage.applyRollMode(
                {
                    content: content,
                    speaker: { actor: actor.id },
                },
                game.settings.get("core", "rollMode"),
            ),
        );
    }

    async _executeMacro(actor, inventoryActor, componentsToConsume, product, productData) {
        if (!this.macroName) return { success: true, consume: false };
        let macro = game.macros.getName(this.macroName.split("|")[0]);
        const macroArgs = macro ? this.macroName.split("|").slice(1) : [];
        if (!macro) macro = { command: this.macroName };
        const AsyncFunction = async function () { }.constructor;
        const fn = new AsyncFunction("actor", "componentsToConsume", "product", "productData", "macroArgs", "inventoryActor", macro.command);
        try {
            return await fn(actor, componentsToConsume, product, productData, macroArgs, inventoryActor);
        } catch (e) {
            ui.notifications.error("There was an error in your macro syntax. See the console (F12) for details");
            return { success: true, consume: false };
        }
    }

    _onCraftError(error = "") {
        ui.notifications.error(game.i18n.localize(`${MODULE_ID}.recipeApp.craftError` + error));
    }

    hasRequire(actor, inventoryActor) {
        if (!this.REQUIRE?.length) return true;
        const actorHasItem = this.REQUIRE.some((tool) => actor.items.getName(tool) !== undefined);
        if (actorHasItem) return true;
        const inventoryActorHasItem = this.REQUIRE.some((tool) => inventoryActor.items.getName(tool) !== undefined);
        if (inventoryActorHasItem) return true;
        return false;
    }

    hasComponent(name) {
        return this.ingredients.some((ingredient) => ingredient.hasComponent(name));
    }

    hasProduct(name) {
        return this.products.some((product) => product.hasComponent(name));
    }

    getIngredient(id) {
        return this.ingredients.find((ingredient) => ingredient.id == id);
    }

    getProduct(id) {
        return this.products.find((product) => product.id == id);
    }

    async saveData() {
        const page = fromUuidSync(this.pageUuid);

        const data = {
            recipeBook: this.recipeBook,
            img: this.img,
            ingredients: this.ingredients.map(ingredient => ingredient.toObject()),
            ingredientsInspection: this.ingredientsInspection,        
            macroName: this.macroName,
            products: this.products.map(product => product.toObject()),
            productInspection: this.productInspection,
            sound: this.sound,
            time: this.time,
            require: this.require,
        }

        await page.update({
            flags: {
                mastercrafted: data
            }
        })

        page.render();
    }

    async update(data) {
        for (let key in data) {
            this[key] = data[key];
        }
        await this.saveData();
    }

    async addComponent(ingredientId, uuid, name, img, tags) {
        const ingredient = this.ingredients.find((ingredient) => ingredient.id == ingredientId) ?? new Ingredient({ recipe: this });
        const component = ingredient.addComponent(uuid, name, img, tags);
        if (!ingredientId) this.ingredients.push(ingredient);
        await this.saveData();
        return { ingredient, component };
    }

    async updateComponentQuantity(ingredientId, componentId, quantity) {
        const ingredient = this.ingredients.find((ingredient) => ingredient.id == ingredientId);
        ingredient.setQuantity(componentId, quantity);
        await this.saveData();
    }

    async removeComponent(ingredientId, componentId) {
        const ingredient = this.ingredients.find((ingredient) => ingredient.id == ingredientId);
        ingredient.removeComponent(componentId);
        if (ingredient.components.length == 0) {
            this.ingredients = this.ingredients.filter((ingredient) => ingredient.id !== ingredientId);
        }
        await this.saveData();
    }

    async addProduct(productId, uuid, name, img) {
        const product = this.products.find((product) => product.id == productId) ?? new Product({ recipe: this });
        product.addComponent(uuid, name, img);
        if (!productId) this.products.push(product);
        await this.saveData();
    }

    async updateProductQuantity(productId, componentId, quantity) {
        const product = this.products.find((product) => product.id == productId);
        product.setQuantity(componentId, quantity);
        await this.saveData();
    }

    async removeProduct(productId, componentId) {
        const product = this.products.find((product) => product.id == productId);
        product.removeComponent(componentId);
        if (product.components.length == 0) {
            this.products = this.products.filter((product) => product.id !== productId);
        }
        await this.saveData();
    }

    toObject() {
        return {
            id: this.id,
            name: this.name,
            time: this.time,
            macroName: this.macroName,
            ingredientsInspection: this.ingredientsInspection,
            productInspection: this.productInspection,
            description: this.description,
            require: this.require,
            ingredients: this.ingredients.map((ingredient) => ingredient.toObject()),
            products: this.products.map((product) => product.toObject()),
            img: this.img,
            sound: this.sound,
            ownership: this.ownership,
        };
    }
}
