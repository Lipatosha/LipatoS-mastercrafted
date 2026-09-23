import { MODULE_ID } from "./main.js";
import { RecipeBook } from "./documents/RecipeBook.js";

export class MastercraftedMigration {
    constructor() { }

    async restoreBackup() {
        const file = await new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";

            input.onchange = (e) => {
            const files = e.target.files;
            if (!files?.length) return reject(new Error("No file selected"));
            resolve(files[0]);
            };

            input.oncancel = () => reject(new Error("File selection cancelled"));

            input.style.display = "none";
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });

        const settings = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(JSON.parse(reader.result));
            reader.onerror = () => { reader.abort(); reject(new Error("Failed to read file")); };
            reader.readAsText(file);
        });

        game.settings.set("mastercrafted", "recipeBooks", settings);
    }

    async migrateBooks() {

        const backupData = JSON.stringify(game.settings.get("mastercrafted", "recipeBooks"));
        foundry.utils.saveDataToFile(backupData, "text", "mastercrafted-backup.json");

        const warning = ui.notifications.warn("Mastercrafted - Migrating all journal pages, do not refresh the page!", { permanent: true });

        const bookNotification = ui.notifications.notify(`Migrating books`, "info", { progress: true });
        const recipeNotification = ui.notifications.notify(`Migrating recipes`, "info", { progress: true });
        
        const books = game.settings.get("mastercrafted", "recipeBooks");
        const journalFolders = game.folders.filter(folder => folder.type === "JournalEntry");
        const mastercraftedFolder = journalFolders.find(folder => folder?.flags?.mastercrafted?.mainMastercraftedFolder)?.id ?? await Folder.create({
            name: "Mastercrafted",
            sorting: "a",
            type: "JournalEntry",
            flags: { mastercrafted: { mainMastercraftedFolder: true } },
        });

        let migratedBooks = 0;
        let migratedRecipes = 0;

        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            const pages = [];

            bookNotification.update({pct: i / books.length, message: `Migrating book: ${book.name}`});

            for (let j = 0; j < book.recipes.length; j++) {
                const recipe = book.recipes[j];
                recipeNotification.update({pct: j / book.recipes.length, message: `Migrating recipe: ${recipe.name}`});
                const page = await this.migrateRecipe(recipe);
                if (page) pages.push(page);
                migratedRecipes++;
            }
            const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
            for (const owner in book.ownership) {
                const oldOwnership = parseInt(book.ownership[owner]);
                if (oldOwnership === 1) {
                    ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                } else if (oldOwnership === 2) {
                    ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
                }
            }
            const newBook = await JournalEntry.create({
                name: book.name,
                id: book.id,
                ownership: ownership,
                folder: mastercraftedFolder,
                pages: pages,
                flags: {
                    mastercrafted: {
                        description: book.description,
                        img: book.img,
                        ingredientsInspection: book.ingredientsInspection,
                        productInspection: book.productInspection,
                        sound: book.sound,
                        require: book.tools,
                    }
                }
            });

            for (const page of newBook.pages) {
                await page.update({
                    flags: {
                        mastercrafted: {
                            recipeBook: RecipeBook.toObject(newBook),
                        }
                    }
                });
            }

            migratedBooks++;
        }

        game.settings.set("mastercrafted", "recipeBooks", {});
        game.settings.set("mastercrafted", "migrateOnStartup", false);

        bookNotification.update({pct: 1, message: `Converted ${migratedBooks} books`});
        recipeNotification.update({pct: 1, message: `Converted ${migratedRecipes} recipes`});
        ui.notifications.remove(warning);
        ui.notifications.success("Mastercrafted migration complete!", { permanent: true });
    }

    async migrateRecipe(recipe) {
        if(!recipe.name) return;

        const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT };
        for (const owner in recipe.ownership) {
            const oldOwnership = parseInt(recipe.ownership[owner]);
            if (oldOwnership === 0) {
                ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
            } else if (oldOwnership === 1) {
                ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
            } else if (oldOwnership === 2) {
                ownership[owner] = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
            }
        }

        for(const thing of [...recipe.ingredients, ...recipe.products]) {
            for(const component of thing.components) {
                const item = await fromUuid(component.uuid);
                component.img = item ? item.img : "icons/commodities/materials/powder-grey.webp";
                const tags = item?.flags?.[MODULE_ID]?.tags ?? "";
                component.tags = Array.isArray(tags) ? tags : tags.split(",").map(tag => tag.trim()).filter(tag => tag);
                const resourcePath = item?.flags?.[MODULE_ID]?.attributePath ?? "";
                component.resourcePath = resourcePath ?? "";
            }
        }
        
        return {
            name: recipe.name,
            type: "mastercrafted.mastercrafted",
            text: {
                content: `<p>${recipe.description}</p>`,
                format: 1
            },
            ownership: ownership,
            flags: {
                mastercrafted: {
                    img: recipe.img,
                    ingredients: recipe.ingredients,
                    ingredientsInspection: recipe.ingredientsInspection,        
                    macroName: recipe.macroName,
                    products: recipe.products,
                    productInspection: recipe.productInspection,
                    sound: recipe.sound,
                    time: recipe.time,
                    require: recipe.tools,
                    toolDc: null,
                    toolCheck: null,
                    abilityCheck: null,
                    abilityDc: null,
                    expression: "",
                    modifierList: [],
                }
            },
        }
    }

    showManualMigrationDialog() {
        new foundry.applications.api.DialogV2({
            window: { title: "Mastercrafted - Migration" },
            content: `<p>Use this dialog to migrate your journal pages to the new structure. This is required for Mastercrafted to function properly.</p>
            <p><b>WARNING:</b> This will modify your journal data. Please back up your world before proceeding.</p>`,
            buttons: [
                {
                    label: "Migrate Books",
                    action: "local",
                    callback: () => this.migrateBooks(),
                },
            ],
        }).render({ force: true });
    }
}