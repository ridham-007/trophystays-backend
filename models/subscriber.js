const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Subscriber = new Schema({
    email: {
        type: String,
        required: true
    }
})

module.exports = mongoose.model('EmailSub', Subscriber)