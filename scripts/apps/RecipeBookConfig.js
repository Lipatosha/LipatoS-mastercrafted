import { MODULE_ID } from "../main.js";
import { MASTERCRAFTED_CONST } from "../config.js";
import { RecipeBook } from "../documents/RecipeBook.js";
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";

export class RecipeBookConfig extends HandlebarsApplication {
    constructor(bookId){
        super();
        this.bookJournal = fromUuidSync(bookId);
        this.book = {
            ...this.bookJournal.flags.mastercrafted,
            name: this.bookJournal.name,
            id: this.bookJournal.id,
            ownership: this.bookJournal.ownership,
        };
    }

    getTitle(){
        let title = this.book ? game.i18n.localize(`${MODULE_ID}.recipeApp.editcreatebook.edit`) : game.i18n.localize(`${MODULE_ID}.recipeApp.editcreatebook.create`);
        title += " " + game.i18n.localize(`${MODULE_ID}.recipeApp.editcreatebook.book`);
        if(this.recipeBook) title += ": " + this.recipeBook.name;
        return title;
    }

    _onRender(...args){
        super._onRender(...args);
        document.querySelector("#mastercrafted-recipeBookConfig .window-title").innerHTML = this.getTitle();
    }
    
    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            tag: "form",
            id: `${MODULE_ID}-recipeBookConfig`,
            window: {
                title: `${MODULE_ID}.${this.APP_ID}.title`,
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
                template: `modules/${MODULE_ID}/templates/book-config.hbs`,
                classes: ["standard-form", "scrollable"],
            },
            footer: {
                template: "templates/generic/form-footer.hbs",
            }
        };
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        Object.assign(context, { 
            book: this.book,
            perm: { ...MASTERCRAFTED_CONST.CONFIG.PERMISSION_CHOICES },
            craftMode: this._userMode
        });

        return context;
    }

    static async #onSubmit(event, form, formData) {
        const data = formData.object;
        await this.bookJournal.update({
            name: data.name,
            flags: {
                mastercrafted: {
                    description: data.description,
                    img: data.img,
                    sound: data.sound,
                    require: data.require,
                    ingredientsInspection: data.ingredientsInspection,
                    productInspection: data.productInspection,
                    macroName: data.macroName,
                    time: data.time,
                }
            }
        });
    }
}
