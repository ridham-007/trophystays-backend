const mongoose = require('mongoose');
const Landlord = require('../models/landlord');

// Connect to your database
mongoose.connect('mongodb://localhost:27017/trophystays', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to DB'))
    .catch(err => console.log('Error connecting to DB', err));

// Array of landlord emails
const landlordEmails = ['landlord1@example.com', 'landlord2@example.com', 'landlord3@example.com', 'speedy.phat@gmail.com'];

// Convert the array of emails into an array of Landlord objects
const landlords = landlordEmails.map(email => ({ email }));

// Seed the database
async function seedDB() {
    // Use the insertMany function to insert all the landlords at once
    await Landlord.deleteMany({})
    await Landlord.insertMany(landlords);
    console.log('Database seeded');
    mongoose.connection.close();
}

seedDB();
