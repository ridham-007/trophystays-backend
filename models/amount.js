const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const AmountSchema = new Schema({
    month: String,
    data: [{
        day: Number,
        properties: [{
            property: String,
            ownerAmount: Number
        }]
    }]
});

// Compile model from schema
module.exports = mongoose.model('Amount', AmountSchema);
