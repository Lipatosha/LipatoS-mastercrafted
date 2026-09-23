
export class MastercraftedPageData extends foundry.abstract.TypeDataModel {

  async toEmbed(config, options={}) {
    const page = this.parent;
    const sheetEmbed = document.createElement("mastercrafted-sheet-embed");
    sheetEmbed.setAttribute("uuid", page.uuid);
    return sheetEmbed;
  }

  /** @inheritDoc */
  static LOCALIZATION_PREFIXES = ["mastercrafted"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      text: new fields.SchemaField({
        content: new fields.HTMLField({required: false, blank: true}),
        format: new fields.NumberField({
          required: true,
          initial: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
        })
      })
    };
  }
}
