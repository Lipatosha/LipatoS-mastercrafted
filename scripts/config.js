import { MODULE_ID } from "./main.js";

export const MASTERCRAFTED_CONST = {
    
    INGREDIENT: {
        IMG: "",
    },
    COMPONENT: {
        IMG: "",
    },
    RECIPE: {
        IMG: "icons/sundries/documents/document-bound-white-tan.webp",
    },
    RECIPE_BOOK: {
        IMG: "icons/sundries/books/book-worn-brown-grey.webp",
    },
    CONFIG: {
        PERMISSION_CHOICES: {
            0: "mastercrafted.recipeApp.configbookrecipe.permissions.default",
            1: "mastercrafted.recipeApp.configbookrecipe.permissions.allow",
            2: "mastercrafted.recipeApp.configbookrecipe.permissions.deny",
        }
    }
}

Object.defineProperty(MASTERCRAFTED_CONST, "QUANTITY", {
    get: function(){
        const sId = game.system.id;
        const custom = game.settings.get(MODULE_ID, "customQuantityPath");
        if(custom) return custom;
        switch(sId){
            case "dsa5":
                return "quantity.value";
            default:
                return "quantity";
        }
    },
});