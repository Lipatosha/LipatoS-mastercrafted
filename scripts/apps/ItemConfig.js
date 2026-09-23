import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { MODULE_ID } from "../main.js";

export class ItemConfig extends HandlebarsApplication {
    constructor (object) {
        super();
        this.object = object;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            id: this.APP_ID,
            window: {
                title: `${MODULE_ID}.itemConfig.title`,
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
                template: `modules/${MODULE_ID}/templates/item-config.hbs`,
                classes: ["standard-form", "scrollable"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            }
        };
    }

    async _prepareContext(options) {

        const tags = this.object.getFlag(MODULE_ID, "tags") ?? "";
        if (!Array.isArray(tags)) await this.object.setFlag(MODULE_ID, "tags", tags.split(",").map(tag => tag.trim()).filter(tag => tag));

        const saveButton = {
            type: "submit",
            action: "submit",
            icon: "fas fa-check",
            label: "Save",
        };
        return { object: this.object, buttons: [saveButton] };
    }

    static #onSubmit(event, form, formData) {
        const data = formData.object;
        const expandedData = foundry.utils.expandObject(data);
        return this.object.update(expandedData);
    }

    static setHooks() {
        if(!game.user.isGM) return;
        Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
            buttons.unshift({
                class: "item-config",
                icon: "fa-duotone fa-hammer",
                onclick: (event) => {
                    event.preventDefault();
                    const item = sheet.object;
                    new ItemConfig(item).render(true);
                },
                label: game.i18n.localize(`${MODULE_ID}.itemConfig.sheetButton`),
            });
        });

        Hooks.on("getHeaderControlsDocumentSheetV2", (app, controls) => {
            if(app.document.documentName !== "Item") return;
            controls.push({
                class: "item-config",
                icon: "fa-duotone fa-hammer",
                onClick: (event) => {
                    event.preventDefault();
                    const item = app.document;
                    new ItemConfig(item).render(true);
                },
                label: game.i18n.localize(`${MODULE_ID}.itemConfig.title`),
            });
        });
    }
}