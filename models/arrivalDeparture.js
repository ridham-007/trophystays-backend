const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ArrivalDeparture = new Schema({
    month: String,
    data: [{
        property: String,
        dates: [{
            arrival: Date,
            departure: Date
        }]

    }]
});

// Compile model from schema
module.exports = mongoose.model('ArrivalDeparture', ArrivalDeparture);
