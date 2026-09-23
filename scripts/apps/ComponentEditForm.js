import { MODULE_ID } from "../main.js";
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

export class ComponentEditForm extends HandlebarsApplication {
    constructor(component, recipe) {
        super();
        this.component = component;
        this.recipe = recipe;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            window: {
                title: `${MODULE_ID}.componentEditForm.title`,
                contentClasses: ["standard-form"],
            },
            form: {
                handler: this.#onSubmit,
                closeOnSubmit: true,
                submitOnChange: false,
            }
        });
    }

    static get PARTS() {
        return {
            content: {
                template: `modules/${MODULE_ID}/templates/${this.APP_ID}.hbs`,
                classes: ["standard-form", "scrollable"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            }
        };
    }

    async _prepareContext(options) {
        const component = this.component;
        const saveButton = {
            type: "submit",
            action: "submit",
            icon: "fas fa-save",
            label: "Submit",
        };
        return { component, buttons: [saveButton] };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;
    }

    static async #onSubmit(event, form, formData) {
        const data = formData.object;
        this.component.update(data);
    }

    _onClose(options) {
        super._onClose(options);
    }
}
