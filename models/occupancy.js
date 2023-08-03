const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const OccupancySchema = new Schema({
    month: String,
    data: [{
        property: String,
        occupancy: String
    }],
    updatedLast: String
});

// Compile model from schema
module.exports = mongoose.model('Occupancy', OccupancySchema);
