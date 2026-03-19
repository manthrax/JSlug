const opentype = require('opentype.js');
const fs = require('fs');

opentype.load('./demo/fonts/NotoColorEmoji-Regular.ttf', (err, font) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Tables:", Object.keys(font.tables));
    if (font.tables.colr) {
        console.log("COLR base glyphs:", font.tables.colr.baseGlyphRecords ? font.tables.colr.baseGlyphRecords.length : 'none');
        console.log("Sample COLR record:", font.tables.colr.baseGlyphRecords[0]);
    } else {
        console.log("No COLR table");
    }
    if (font.tables.cpal) {
        console.log("CPAL palettes:", font.tables.cpal.colorRecords ? font.tables.cpal.colorRecords.length : 'none');
        console.log("Sample CPAL color:", font.tables.cpal.colorRecords[0]);
    } else {
        console.log("No CPAL table");
    }
});
