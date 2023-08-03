const mongoose = require('mongoose')
const Schema = mongoose.Schema
const passportLocalMongoose = require('passport-local-mongoose')

const UserSchema = new Schema({
    email: {
        type: String,
        required: true,
        unqiue: true
    },
    ownerRezId: Number,
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
    birthDay: { type: Date, required: false },
    verificationToken: String,
    isVerified: { type: Boolean, required: false },
    profilePictureurl: String,
    passwordResetToken: String,
    passwordResetExpires: Number,
    isLandlord: {
        type: Boolean,
        default: false,
    },
    wishlist: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Apartment'
        }
    ],
    phoneNumber: String,
    governmentId: {
        id: String,
        imageUrls: [
            String
        ]
    },
    passportId: {
        id: String,
        imageUrl: String
    },
    address: {
        street1: String,
        street2: String,
        city: String,
        country: String,
        postalCode: String,
        state: String,
        area: String,
    },
})

UserSchema.plugin(passportLocalMongoose, { usernameField: 'email' })

module.exports = mongoose.model('User', UserSchema)