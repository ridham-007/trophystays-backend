const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AreaSchema = new Schema({
    city: String,
    area: String
})

module.exports = mongoose.model('Area', AreaSchema)