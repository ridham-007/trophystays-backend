const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ApartmentSchema = new Schema({
    longitude: Number,
    latitude: Number,
    internalName: String,
    externalName: String,
    averageReview: Number,
    bedrooms: Number,
    bathrooms: Number,
    images: [
        {
            croppedUrl: String,
            originalUrl: String,
        }
    ],
    dailyPriceFrom: Number,
    dailyPriceTo: Number,
    monthlyPriceFrom: Number,
    ownerRezId: Number,
    address: {
        String
    },
    internalCode: String,
    pxOwnerId: Number
})

module.exports = mongoose.model('Apartment', ApartmentSchema)