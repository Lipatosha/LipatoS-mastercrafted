import { MODULE_ID } from "../main.js";
import { MASTERCRAFTED_CONST } from "../config.js";
import { mergeObject } from "../lib/utils.js";
import { RecipeBook } from "../documents/RecipeBook.js";

const compendiumIndex = new Map();

export class Ingredient {
    constructor({ id = null, name = null, components = [], recipe = null }) {
        this.id = id ?? foundry.utils.randomID();
        this.name = name;
        this.recipe = recipe;
        this.components = components.map((component) => new Component(component, recipe, this));
    }

    getComponent(id) {
        return this.components.find((component) => component.id === id);
    }

    addComponent(uuid, name, img, tags) {
        const component = new Component({ uuid, quantity: 1, name, img, tags}, this.recipe, this);
        this.components.push(component);
        return component;
    }

    removeComponent(id) {
        this.components = this.components.filter((component) => component.id !== id);
    }

    setQuantity(id, quantity) {
        const component = this.components.find((component) => component.id === id);
        component.quantity = quantity;
    }

    hasComponent(name) {
        return this.components.some((component) => component._name === name || component.name === name);
    }

    hasComponents(actor) {
        if (!actor) return { availableComponents: [], maxCraftableProducts: 0 };
        let isOneSelected = false;
        let maxCraftableProducts = Infinity;
        const availableComponents = [];
        for (let component of this.components) {
            if (RecipeBook.isComponentSelected(this.recipe.id, this.id, component.id)) {
                isOneSelected = true;
                component.selected = true;
                break;
            }
        }
        if (!isOneSelected && this.components.length) this.components[0].selected = true;
        for (let component of this.components) {
            let quantityToConsume = component.quantity;
            let totalQuantity = 0;

            const resourcePath = component.resourcePath;
            if (resourcePath) {
                const actorResource = resourcePath ? parseFloat(foundry.utils.getProperty(actor.system, resourcePath)) || 0 : 0;
                totalQuantity += actorResource;
            } else {
                const nameItem = actor.items.find(item => {
                    if (item.name === component.name) return item;
                    if (!component.uuid || !item.flags?.core?.sourceId) return undefined;
                    if (item.flags?.core?.sourceId === component.uuid) return item;
                });
                const nameItemQuantity = nameItem ? parseFloat(foundry.utils.getProperty(nameItem.system, MASTERCRAFTED_CONST.QUANTITY)) : 0;
                const tags = component.tags;
                const tagItems = tags?.length !== 0 ? actor.items.filter((item) => component.hasTags(item)).filter((item) => item.id !== nameItem?.id) : [];
                totalQuantity += nameItemQuantity + tagItems.reduce((total, item) => total + parseFloat(foundry.utils.getProperty(item.system, MASTERCRAFTED_CONST.QUANTITY), 0), 0);
            }

            component.inventoryQuantity = totalQuantity;
            if (totalQuantity < quantityToConsume) {
                if (component.selected) maxCraftableProducts = 0;
                availableComponents.push({
                    selected: component.selected,
                    id: component.id,
                    available: false,
                });
            } else {
                if (component.selected) maxCraftableProducts = Math.min(maxCraftableProducts, Math.floor(component.inventoryQuantity / component.quantity));
                availableComponents.push({
                    selected: component.selected,
                    id: component.id,
                    available: true,
                });
            }
        }
        return { availableComponents, maxCraftableProducts };
    }

    toObject() {
        return {
            id: this.id,
            name: this.name,
            components: this.components.map((component) => component.toObject()),
        };
    }
}

export class Product extends Ingredient {
    constructor({ id = null, name = null, components = [] }) {
        super({ id, name, components });
    }
}

class Component {
    constructor({ id, uuid, quantity, name, tags, img, resourcePath, mode }, recipe, ingredient) {
        this.id = id ?? foundry.utils.randomID();
        this.uuid = uuid;
        this._name = name;
        this.quantity = quantity;
        this.recipe = recipe;
        this.ingredient = ingredient;
        this.inventoryQuantity = 0;
        this._tags = tags ?? [];
        this._resourcePath = resourcePath ?? "";
        this._img = img ?? "";
        this._mode = mode ?? "some";
    }

    clone(diff) {
        return new Component({ ...this.toObject(), ...diff }, this.recipe, this.ingredient);
    }

    get resourcePath() {
        return this._resourcePath;
    }

    get documentLink() {
        return `@UUID[${this.uuid}]{${this.name} x ${this.quantity}}`;
    }

    get item() {
        return this._item;
    }

    get tags() {
        return this._tags;
    }

    get mode() {
        return this._mode;
    } 

    getTags(item) {
        const flag = item.flags?.[MODULE_ID]?.tags ?? [];
        if (Array.isArray(flag)) return flag; 
        return flag
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag);
    }

    hasTags(item) {
        const itemTags = this.getTags(item);
        if (this._mode === "some") return this._tags.some((tag) => itemTags.includes(tag));
        return this._tags.every(tag => itemTags.includes(tag));
    }

    get name() {
        return this._name;
    }

    get img() {
        return this._img;
    }

    async getItem(loadDocuments = true) {
        const useCached = !loadDocuments && this._item?._fromIndex;
        if (this._item && useCached) return this._item;
        const item = await fromUuid(this.uuid) ?? undefined;
        this._item = item;
        this._name = this.name;
        this.uuid = this._item.uuid;
        return this._item;
    }

    async tryFromUuid(...args) {
        try {
            return await fromUuid(...args);
        }
        catch (err) {
            return undefined;
        }
    }


    render() {
        this._item.sheet.render(true);
    }

    toObject() {
        return {
            id: this.id,
            uuid: this.uuid,
            quantity: this.quantity,
            name: this.name,
            img: this.img,
            tags: this.tags,
            resourcePath: this.resourcePath,
            mode: this.mode,
        };
    }

    update(data) {
        const flags = this.recipe.document.flags.mastercrafted;
        if (!flags) return;
        const component = flags.ingredients?.find(ingredient => ingredient.id === this.ingredient.id)?.components?.find(component => component.id === this.id);
        if (!component) return;
        mergeObject(component, data);

        this.recipe.document.update({
            flags: {
                mastercrafted: flags
            }
        })
    }
}
