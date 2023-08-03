const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LandlordSchema = new Schema({
    email: {
        type: String,
        unique: true
    },
    phoneNumber: {
        type: String,
        unique: true
    },
    ownerRezId: Number,
    name: String
});

module.exports = mongoose.model('Landlord', LandlordSchema);
