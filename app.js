//ToDO
//When user is created send the user to ownerrez to retrieve te id *
//Do the payment request and create a booking
// add those bookings to the user's account
//create a history of bookings
//create a booking confirmation
//create the landlord overview
//landlord each individual property overview
//Download the landlord button
//landlord profile
//DONE


require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const app = express()
const PORT = 3000
const axios = require('axios')

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')

const crypto = require('crypto');
const nodemailer = require('nodemailer')
const bodyParser = require('body-parser')
const requestTracker = require('./utils/requestTracker')

const multer = require('multer')
const FormData = require('form-data')
const sharp = require('sharp')
const fs = require('fs')


//MODEL IMPORTS
const User = require('./models/User')
const Landlord = require('./models/landlord')
const Area = require('./models/area')
const Apartment = require('./models/apartment')
const Subscriber = require('./models/subscriber')



//UTILS
const { daysToMilliseconds, minutesToMilliseconds } = require('./utils/serverFunc')


//SERVER Configs
const dbUrl = 'mongodb://localhost:27017/trophystays'

mongoose.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Conntected to DB'))
    .catch(err => console.log('Error connecting to DB', err))


const secret = process.env.SECRET || 'thisshouldbeabettersecret'

const ownerRezUsername = process.env.OWNERREZ_USERNAME
const ownerRezPassword = process.env.OWNERREZ_TOKEN

// console.log(ownerRezPassword, ownerRezUsername)
const ownerRezBufferToken = Buffer.from(`${ownerRezUsername}:${ownerRezPassword}`, 'utf8').toString('base64')

const ownerRezConfig = {
    headers: {
        'Authorization': `Basic ${ownerRezBufferToken}`
    }
}

async function fetchListings() {
    try {
        const limit = 100;
        let offset = 0;
        let nextPage = true;

        // Prepare all properties Map
        const allProperties = new Map();

        while (nextPage) {
            // Fetch all properties with included fields
            const allPropertiesResponse = await axios.get(`https://api.ownerreservations.com/v2/properties?include_fields=true&limit=${limit}&offset=${offset}`, ownerRezConfig);

            allPropertiesResponse.data.items.forEach(property => {
                const fields = property.fields;
                let pxOwnerId;
                for (let i = 0; i < fields.length; i++) {
                    if (fields[i].code === 'PXOWNERID') {
                        pxOwnerId = fields[i].value;
                        break;
                    }
                }
                allProperties.set(property.id, pxOwnerId);
            });

            // Check if there is a next page, if not, the loop will terminate
            nextPage = !!allPropertiesResponse.data.next_page_url;

            // If there is a next page, increase the offset by the limit
            if (nextPage) {
                offset += limit;
            }
        }

        const response = await axios.get('https://api.ownerreservations.com/v1/listings/summary', ownerRezConfig)

        const mappedResponse = await Promise.all(response.data.map(async (property) => {
            let imagesResponse = await axios.get(`https://api.ownerreservations.com/v1/properties/${property.id}/images`, ownerRezConfig);
            let images = imagesResponse.data;
            let monthlyPriceFrom;

            if (typeof property.nightlyRateMin === 'number') {
                monthlyPriceFrom = Math.floor(property.nightlyRateMin * 30 / 100) * 100;
            } else {
                console.error(`nightlyRateMin is not a number for property id ${property.id}`);
            }

            let pxOwnerId = allProperties.get(property.id);

            let propertyObject = {
                ownerRezId: property.id,
                address: property.address,
                longitude: property.longitude,
                latitude: property.latitude,
                internalName: property.name,
                internalCode: property.internalCode,
                bedrooms: property.bedroomCount,
                bathrooms: property.bathroomCount,
                averageReview: property.reviewAverage,
                dailyPriceFrom: property.nightlyRateMin,
                dailyPriceTo: property.nightlyRateMax,
                images,
                monthlyPriceFrom,
                pxOwnerId
            }

            if (property.externalName) {
                propertyObject.externalName = property.externalName
            }

            console.log(propertyObject)

            return propertyObject
        }));

        await Apartment.deleteMany({});

        return Promise.all(
            mappedResponse.map((property) => new Apartment(property).save())
        )

    } catch (err) {
        console.error(err);
    }
}

let propertyIds = []

async function fetchRecords() {
    try {
        const limit = 100;
        let offset = 0;
        let results = [];
        let nextPage = true;

        while (nextPage) {
            const response = await axios.get(`https://api.ownerreservations.com/v2/listings?limit=${limit}&offset=${offset}`, ownerRezConfig);
            const items = response.data.items;
            let propertyIds = items.map(item => item.property_id);

            console.log('Property IDs:', propertyIds);

            for (const propertyId of propertyIds) {
                const propertyResponse = await axios.get(`https://api.ownerreservations.com/v2/properties/${propertyId}`, ownerRezConfig);
                console.log(propertyResponse.data);
                const { city, province } = propertyResponse.data.address;
                results.push({ city, province });
            }

            // Check if there is a next page, if not, the loop will terminate
            nextPage = !!response.data.next_page_url;

            // If there is a next page, increase the offset by the limit
            if (nextPage) {
                offset += limit;
            }
        }

        return results;
    } catch (error) {
        console.error('Error retrieving data:', error);
    }
}


async function fetchLandlords() {
    try {

        // Delete all existing landlord records
        await Landlord.deleteMany({})

        const limit = 100;
        let offset = 0;
        let nextPage = true;

        while (nextPage) {
            const response = await axios.get(`https://api.ownerreservations.com/v2/owners?active=true&include_fields=true&limit=${limit}&offset=${offset}`, ownerRezConfig)
            const landlords = response.data.items;

            await Promise.all(landlords.map(async (landlord) => {
                const landlordConfig = {};

                if (landlord.email_address) {
                    landlordConfig.email = landlord.email_address;
                }
                if (landlord.phone && landlord.phone.number) {
                    landlordConfig.phoneNumber = landlord.phone.number;
                }
                if (landlord.id) {
                    landlordConfig.ownerRezId = landlord.id;
                }
                if (landlord.name) {
                    landlordConfig.name = landlord.name;
                }

                // Create a new Landlord instance and save it to the database
                const newLandlord = new Landlord(landlordConfig);
                await newLandlord.save();
            }));

            // Check if there is a next page, if not, the loop will terminate
            nextPage = !!response.data.next_page_url;

            // If there is a next page, increase the offset by the limit
            if (nextPage) {
                offset += limit;
            }
        }

    } catch (error) {
        console.error('Error fetching landlords:', error);
    }
}

fetchLandlords()

//Reduce the results
function filterProvinces(records) {
    const dubaiRecords = records.filter((record) => record.city.toLowerCase() === 'dubai');
    const uniqueProvinces = [...new Set(dubaiRecords.map((record) => record.province))].filter((province) => province !== undefined);

    return uniqueProvinces;
}

fetchRecords()
    .then((response) => {
        const uniqueProvinces = filterProvinces(response);
        console.log('Provinces within Dubai:', uniqueProvinces);

        // Delete all records from the collection
        return Area.deleteMany({})
            .then(() => {
                // Save city and suburb data into MongoDB
                const areasToSave = uniqueProvinces.map((province) => ({ city: 'Dubai', area: province }));
                return Area.insertMany(areasToSave)
                    .then(() => fetchListings())
            })
    })
    .then(response => {

    })
    .catch((err) => {
        console.error(err);
    })


setInterval(() => {
    console.log('This will run every 60 minutes');

    fetchLandlords()
    fetchRecords()
        .then((response) => {
            const uniqueProvinces = filterProvinces(response);
            console.log('Provinces within Dubai:', uniqueProvinces);

            // Save city and suburb data into MongoDB
            const areasToSave = uniqueProvinces.map((province) => ({ city: 'Dubai', area: province }));
            return Area.insertMany(areasToSave);
        })
        .catch((err) => {
            console.error(err);
        })


}, minutesToMilliseconds(60)); // 60 minutes in milliseconds


const sevenDaystoMilliseconds = daysToMilliseconds(7)
const sessionConfig = {
    name: 'session',
    secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        // secure: true,
        expires: Date.now() + sevenDaystoMilliseconds,
        maxAge: sevenDaystoMilliseconds
    }
}

//APP SETS


//APP USES
app.use(express.urlencoded({ extended: true }))
app.use(session(sessionConfig))
app.use(passport.initialize())
app.use(passport.session())
// app.use(bodyParser.json())

//Keep track of requests
// app.use(requestTracker)


app.use((req, res, next) => {
    next()
})


//PASSPORT
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return done(null, false, { message: 'Incorrect email.' });
        }
        user.authenticate(password, (err, model, passwordErr) => {
            if (passwordErr) {
                return done(null, false, { message: 'Incorrect password.' });
            }
            return done(null, user);
        });
    } catch (err) {
        return done(err);
    }
}));


passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())

//Middlewares
// function checkIsVerified(req, res, next) {
//     console.log(req)
//     if (req.user.isVerified) {
//         next()
//     } else {
//         res.status(401).send({ message: 'Your email is not verified' })
//     }
// }

async function checkIsVerified(req, res, next) {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(400).send({ message: 'No user with this email address exists.' });
        }
        if (!user.isVerified) {
            return res.status(401).send({ message: 'Your email is not verified' });
        }
        next();
    } catch (err) {
        return res.status(500).send({ message: err.message });
    }
}

// const upload = multer({ dest: 'uploads/', fileFilter: fileFilter })

// const fileFilter = (req, file, cb) => {
//     if (file.mimetype == 'image/jpeg' || file.mimetype == 'image/jpg' || file.mimetype == 'image/png') {
//         cb(null, true);
//     } else {
//         cb(null, false);
//         return cb(new Error('Only .jpg, .jpeg and .png format allowed!'));
//     }
// }


function debug(req, res, next) {
    console.log(req.body)
    next()
}


//ROUTES
app.get('/', (req, res) => {
    res.send('working!')
})

app.get('/test', (req, res) => {

})

app.post('/login', passport.authenticate('local'), checkIsVerified, async (req, res) => {
    res.send('Logged in!')
})

app.post('/register-email', async (req, res) => {
    const { email } = req.body

    console.log({email})
    try {

        // Check if a user with this email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ message: 'A user with this email already exists.' });
        }

        // Check if the email is in the landlords collection
        const landlord = await Landlord.findOne({ email });
        let isLandlord
        if (landlord) {
            isLandlord = true
        } else {
            isLandlord = false
        }

        // Generate a 6-digit verification code
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
        const user = new User({
            email,
            isVerified: false,
            verificationToken,
            isLandlord
        })
        await user.save()


        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'dev.olegovich@gmail.com',
                pass: 'vkjyrsggvnnukaei'
            }
        })

        let mailOptions = {
            from: 'dev.olegovich@gmail.com',
            to: user.email,
            subject: 'Email Verification',
            text: `Here is your email verification code: ${user.verificationToken}`
        }

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error)
            } else {
                console.log('Email has been sent successfully: ' + info.response)
            }
        })

        res.status(200).send({ message: 'User Registered. Please check your email' })
    } catch (err) {
        //Flash error
        res.status(500).send({ message: err.message })
    }
})

app.post('/register', async (req, res) => {
    console.log(req.body);
    const { email, password, firstName, lastName, birthDay, profilePictureUrl } = req.body
    try {

        userConfig = {
            email,
            firstName,
            lastName,
            birthDay,
            profilePictureUrl
        }

        let user = await User.findOneAndUpdate({ email }, userConfig, { new: true })
        console.log(user)

        if (!user) {
            throw new Error('Error has occurred', 500)
        }

        user.setPassword(password, async function (err) {
            if (err) {
                return res.status(500).send({ message: err.message })
            }
            await user.save()
        })

        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'dev.olegovich@gmail.com',
                pass: 'vkjyrsggvnnukaei'
            }
        })

        let mailOptions = {
            from: 'dev.olegovich@gmail.com',
            to: user.email,
            subject: 'Account Created!',
            text: `Your Account with TrophyStays has been created`
        }

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error)
            } else {
                console.log('Email has been sent successfully: ' + info.response)
            }
        })

        res.status(200).send({ message: 'User Registered. Please check your email' })
    } catch (err) {
        //Flash error
        res.status(500).send({ message: err.message })
    }
})

app.post('/resend-verification-email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            return res.status(400).send({ message: 'No account with this email address exists.' });
        }

        if (user.isVerified) {
            return res.status(400).send({ message: 'This account has already been verified.' });
        }

        // Generate a new verification token
        user.verificationToken = crypto.randomBytes(32).toString('hex');
        await user.save();

        // Send a new verification email
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'dev.olegovich@gmail.com',
                pass: 'vkjyrsggvnnukaei'
            }
        });

        let mailOptions = {
            from: 'dev.olegovich@gmail.com',
            to: user.email,
            subject: 'Email Verification',
            text: `Here is your email verification code: ${user.verificationToken}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });

        res.status(200).send({ message: 'Verification email sent.' });
    } catch (error) {
        res.status(500).send({ message: 'An error occurred while resending the verification email.' });
    }
});


app.get('/verify-email', async (req, res) => {
    try {
        const user = await User.findOne({ verificationToken: req.query.verificationToken })

        if (!user) {
            return res.status(400).send({ message: 'Invalid verification token' })
        }

        user.isVerified = true
        user.verificationToken = undefined
        await user.save()

        res.send({ message: 'Email verified successfully' })
    } catch (err) {
        res.status(500).send({ message: err.message })
    }
})

app.post('/forgot-password', checkIsVerified, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(400).send({ message: 'No user with this email address exists.' });
        }

        // Generate a password reset token
        const passwordResetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = passwordResetToken;
        user.passwordResetExpires = Date.now() + 3600000; // Token expires after 1 hour
        await user.save();

        // Send password reset email
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'dev.olegovich@gmail.com',
                pass: 'vkjyrsggvnnukaei'
            }
        });

        let mailOptions = {
            from: 'dev.olegovich@gmail.com',
            to: user.email,
            subject: 'Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.
            Please click on the following link, or paste this into your browser to complete the process within one hour of receiving it:
            http://localhost:3000/reset-password?token=${passwordResetToken}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });

        res.status(200).send({ message: 'Password reset email sent.' });
    } catch (error) {
        res.status(500).send({ message: 'An error occurred while processing your request.' });
    }
});


//redirect the user to GET /reset-password and post on this page
app.post('/reset-password', async (req, res) => {
    try {
        const user = await User.findOne({
            passwordResetToken: req.body.token,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send({ message: 'Invalid or expired password reset token.' });
        }

        // Set the new password
        user.setPassword(req.body.password, async (err) => {
            if (err) {
                return res.status(500).send({ message: 'Error resetting password.' });
            }

            // Clear the password reset token and expiration
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save();

            // Send a confirmation email
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'dev.olegovich@gmail.com',
                    pass: 'vkjyrsggvnnukaei'
                }
            });

            let mailOptions = {
                from: 'dev.olegovich@gmail.com',
                to: user.email,
                subject: 'Your password has been changed',
                text: `Hello,
                This is a confirmation that the password for your account ${user.email} has just been changed.`
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                } else {
                    console.log('Email sent: ' + info.response);
                }
            });

            res.status(200).send({ message: 'Password reset successful.' });
        });
    } catch (error) {
        res.status(500).send({ message: 'An error occurred while processing your request.' });
    }
});

app.get('/areas', async (req, res) => {

    try {
        const areas = await Area.find(); // Retrieve all areas from the MongoDB collection

        res.json(areas); // Send the areas as a JSON response
    } catch (error) {
        console.error('Error retrieving areas:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
})

//STILL NEED TO APPLY SORTING FILTERS
// Helper function to check JSON length
const checkLengthJson = (json, res) => {
    if (json.length === 0) {
        res.status(404).json({ message: "Sorry, didn't find anything." });
    } else {
        res.json(json);
    }
};

// Helper function to find apartments based on the conditions
const findApartments = async (ids, bedrooms, term) => {
    let conditions = { ownerRezId: { $in: ids } };
    if (bedrooms) {
        conditions.bedrooms = Number(bedrooms);
    }
    return await Apartment.find(conditions);
};

app.get('/listings', async (req, res) => {
    let { moveInDate, moveOutDate, term, bedrooms } = req.query;
    let userId = req.session.userId
    let ids = [];
    let filteredProperties;
    let userWishlist = [];

    // Fetch user's wishlist if userId is provided
    if (userId) {
        try {
            const user = await User.findById(userId).populate('wishlist');
            userWishlist = user ? user.wishlist : [];
        } catch (err) {
            // Log the error, return a response, etc.
        }
    }

    if (moveInDate && moveOutDate) {
        moveInDate = new Date(moveInDate);
        moveOutDate = new Date(moveOutDate);

        const utcMoveIn = moveInDate.toISOString();
        const utcMoveOut = moveOutDate.toISOString();

        const response = await axios.get(`https://api.ownerreservations.com/v2/properties?availability_start_date=${utcMoveIn}&availability_end_date=${utcMoveOut}`, ownerRezConfig);

        ids = response.data.items.map(item => item.id);
    }

    filteredProperties = await findApartments(ids, bedrooms, term);

    // Filter out properties without images
    const propertiesWithImages = filteredProperties.filter(property => property.images && property.images.length > 0);

    // Map properties to match the desired response format
    const formattedProperties = propertiesWithImages.map(property => {
        const isWishlisted = userWishlist.some(wishlistItem => wishlistItem._id.equals(property._id));
        return {
            _id: property._id,
            longitude: property.longitude,
            latitude: property.latitude,
            internalName: property.internalName,
            averageReview: property.averageReview,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            images: property.images,
            ownerRezId: property.ownerRezId,
            internalCode: property.internalCode,
            __v: property.__v,
            isMonthly: term === "monthly", // Add isMonthly property based on the term value
            isWishlisted // Add isWishlisted property based on the user's wishlist
        };
    });

    checkLengthJson(formattedProperties, res);
});

app.get('/listings/:id', async (req, res) => {
    const id = req.params.id;
    let userId = req.session.userId;

    let userWishlist = [];

    // Fetch user's wishlist if userId is provided
    if (userId) {
        try {
            const user = await User.findById(userId).populate('wishlist');
            userWishlist = user ? user.wishlist : [];
        } catch (err) {
            // Log the error, return a response, etc.
        }
    }

    try {
        const response = await axios.get(`https://api.ownerreservations.com/v1/listings/${id}/summary?includeAmenities=true&includeDescriptions=true`, ownerRezConfig);

        // The returned data
        const listingData = response.data;

        // Remove wifiPassword from the object
        delete listingData.wifiPassword;

        // Add wishlisted information
        listingData.isWishlisted = userWishlist.some(wishlistItem => wishlistItem._id.equals(id));

        // Respond with the filtered data
        res.json(listingData);
    } catch (error) {
        res.status(500).json({ message: error });
    }
});


app.get('/user/:userId/profile', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (user) {
            const userProfile = {
                profilePictureUrl: user.profilePictureurl || "Default Picture Url",
                name: user.firstName + ' ' + user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber || "Not Available",
                address: user.address || "Not Available",
                governmentId: user.governmentId || { id: "Not Available", imageUrl: "Default Image Url" },
                passportId: user.passportId || { id: "Not Available", imageUrl: "Default Image Url" },
            };

            const userAdress = user.address
            const data = {
                addresses: [
                    {
                        city: userAdress?.city || "Not Available",
                        country: userAdress?.country || "Not Available",
                        is_default: true,
                        postal_code: userAdress?.postalCode || "Not Available",
                        province: userAdress?.area || "Not Available",
                        state: userAdress?.state || "Not Available",
                        street1: userAdress?.street1 || "Not Available",
                        street2: userAdress?.street2 || "Not Available",
                        type: "home"
                    }
                ],
                email_addresses: [
                    {
                        address: user?.email || "Not Available",
                        is_default: true,
                        type: "home"
                    },
                ],
                first_name: user?.firstName || "Not Available",
                last_name: user?.lastName || "Not Available",
                notes: "TEST",
                phones: [
                    {
                        extension: "sample string 2",
                        is_default: true,
                        number: "sample string 1",
                        type: "home"
                    },
                ]
            };


            await axios.post('https://api.ownerreservations.com/v2/guests', data, ownerRezConfig)
                .then(response => {
                    //Save the ownerRezId to the current user in mongoDB

                    console.log(response.data.id)
                    user.ownerRezId = response.data.id;
                    return user.save()
                })
                .catch(err => {
                    console.error(`Error: ${err.message}`)
                    console.error(`Error Response: ${JSON.stringify(err.response.data)}`)
                })


            res.json(userProfile);
        } else {
            res.status(404).send('User not found');
        }
    } catch (err) {
        console.log(err);
        res.status(500).send('Server error');
    }
});


async function processImage(file) {
    const newPath = 'uploads/resized/' + file.filename + '.jpg';

    // Check file size
    const { size } = fs.statSync(file.path);
    const fileSizeInMB = size / (1024 * 1024);

    // Always resize the image to 400x400, but reduce quality if larger than 1MB
    let sharpStream = sharp(file.path).resize(400, 400).jpeg();
    if (fileSizeInMB > 1) {
        sharpStream = sharpStream.jpeg({ quality: 80 });
    }

    await sharpStream.toFile(newPath);
    return newPath; // This should return the URL where the processed image is stored
}

async function uploadImageToCloudflare(imagePath) {
    const form = new FormData()
    form.append('file', fs.createReadStream(imagePath))

    const result = await axios.post(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1`, form, {
        headers: {
            'Authorization': `Bearer ${process.env.CLOUDFLARE_TOKEN}`,
            ...form.getHeaders()
        },
    });

    return result.data.result.variants[0]
}

// upload.fields([
//     { name: 'profile', maxCount: 1 },
//     { name: 'passport1', maxCount: 1 }, ,
//     { name: 'government1', maxCount: 1 },
//     { name: 'government2', maxCount: 1 },

// ])

app.put('/user/:userId/profile', async (req, res) => {
    const { profilePictureurl, firstName, lastName, phoneNumber, address, governmentId, passportId } = req.body;

    const updatedUser = {};
    const updatedUserImages = {}

    // if (profilePictureurl) updatedUser.profilePictureurl = profilePictureurl;
    if (firstName) updatedUser.firstName = firstName;
    if (lastName) updatedUser.lastName = lastName;
    if (phoneNumber) updatedUser.phoneNumber = phoneNumber;
    if (address) updatedUser.address = address;
    // if (governmentId) updatedUser.governmentId = governmentId;
    // if (passportId) updatedUser.passportId = passportId;

    try {

        // process the profile picture
        if (req.files['profile']) {
            const profilePicture = req.files['profile'][0];
            const newPath = await processImage(profilePicture);
            const imagePath = await uploadImageToCloudflare(newPath)
            updatedUser.profilePicture = imagePath;
        }

        // process passport1
        if (req.files['passport1']) {
            const passportId = {
                id: undefined,
                imageUrl: undefined
            }

            passportId.id = passportId.id
            const passport1 = req.files['passport1'][0];
            const newPath = await processImage(passport1);
            const imagePath = await uploadImageToCloudflare(newPath)
            passportId.imageUrl = imagePath // This should be the URL where the processed image is stored
            updatedUser.passportId = passportId
        }

        //process governmentId
        if (req.files['government1'] && req.files['government2']) {
            const governmentIdIn = {
                id: undefined,
                imageUrls: []
            }
            governmentIdIn.id = governmentId.id
            const imageUrlsIn = []
            for (let i = 0; i < 2; i++) {
                const governmentId = req.files[`government${i + 1}`][0]
                const newPath = await processImage(governmentId)
                const imagePath = await uploadImageToCloudflare(newPath)
                imageUrlsIn.push(imagePath)
            }
            governmentId.imageUrls = imageUrlsIn
        }




        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { $set: updatedUser },
            { new: true } // This option makes sure the function returns the updated user
        );

        const userAdress = user.address
        const data = {
            addresses: [
                {
                    city: userAdress?.city || "Not Available",
                    country: userAdress?.country || "Not Available",
                    is_default: true,
                    postal_code: userAdress?.postalCode || "Not Available",
                    province: userAdress?.area || "Not Available",
                    state: userAdress?.state || "Not Available",
                    street1: userAdress?.street1 || "Not Available",
                    street2: userAdress?.street2 || "Not Available",
                    type: "home"
                }
            ],
            email_addresses: [
                {
                    address: user?.email || "Not Available",
                    is_default: true,
                    type: "home"
                },
            ],
            first_name: user?.firstName || "Not Available",
            last_name: user?.lastName || "Not Available",
            notes: "TEST",
            phones: [
                {
                    extension: "sample string 2",
                    is_default: true,
                    number: "sample string 1",
                    type: "home"
                },
            ]
        };


        await axios.put(`https://api.ownerreservations.com/v2/guests/${user.ownerRezId}`, data, ownerRezConfig)
            .then(response => {
                //Save the ownerRezId to the current user in mongoDB

                console.log(response.data.id)
                user.ownerRezId = response.data.id;
                return user.save()
            })
            .catch(err => {
                console.error(`Error: ${err.message}`)
                console.error(`Error Response: ${JSON.stringify(err.response.data)}`)
            })



        if (!user) {
            return res.status(404).send('User not found');
        }

        res.json(user);
    } catch (err) {
        console.log(err);
        res.status(500).send('Server error');
    }
});

app.get('/user/:userId/wishlist', async (req, res) => {
    const userId = req.params.userId;

    try {
        // Fetch user with populated wishlist
        const user = await User.findById(userId).populate('wishlist');
        // If user does not exist or has no wishlist, return appropriate response
        if (!user || !user.wishlist) {
            return res.status(404).json({ message: 'Wishlist not found' });
        }
        // Respond with the user's wishlist
        res.json({ wishlist: user.wishlist });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post('/wishlist', async (req, res) => {
    const { propertyId } = req.params;
    const userId = req.session.userId

    if (!userId) {
        return res.status(400).json({ error: "User not logged in" });
    }

    try {
        // Find the user
        const user = await User.findById(userId);

        // Check if the property is already in the wishlist
        const alreadyInWishlist = user.wishlist.some(id => id.equals(propertyId));

        if (alreadyInWishlist) {
            // If it's already in the wishlist, remove it
            user.wishlist = user.wishlist.filter(id => !id.equals(propertyId));
        } else {
            // If it's not in the wishlist, add it
            user.wishlist.push(propertyId);
        }

        // Save the updated user
        await user.save();

        // Respond with success
        res.json({ success: true, wishlist: user.wishlist });

    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post('/sendguest', async (req, res) => {

    // Retrieve the user
    const user = await User.findOne({ _id: '64addf5ca0daae04599d31b8' })

    const userAdress = user.address
    const data = {
        addresses: [
            {
                city: userAdress.city,
                country: userAdress.country,
                is_default: true,
                postal_code: userAdress.postalCode,
                province: userAdress.area,
                state: userAdress.state,
                street1: userAdress.street1,
                street2: userAdress.street2,
                type: "home"
            }
        ],
        email_addresses: [
            {
                address: user.email,
                is_default: true,
                type: "home"
            },
        ],
        first_name: user.firstName,
        last_name: user.lastName,
        notes: "TEST",
        phones: [
            {
                extension: "sample string 2",
                is_default: true,
                number: "sample string 1",
                type: "home"
            },
        ]
    };

    await axios.post('https://api.ownerreservations.com/v2/guests', data, ownerRezConfig)
        .then(response => {
            //Save the ownerRezId to the current user in mongoDB

            console.log(response.data.id)
            user.ownerRezId = response.data.id;
            return user.save()
        })
        .catch(err => {
            console.error(`Error: ${err.message}`)
            console.error(`Error Response: ${JSON.stringify(err.response.data)}`)
        })
    res.send('Done')
})

app.get('/user/:userId/bookinghistory', async (req, res) => {
    // Get user from your database
    const user = await User.findById(req.params.userId);

    // Error handling in case user doesn't exist
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    const sinceUTC = '2023-07-15'  //15th July

    // Make the request to the bookings endpoint
    try {
        const response = await axios.get(`https://api.ownerreservations.com/v2/bookings?since_utc=${sinceUTC}&limit=100`, ownerRezConfig);

        // Filter the items array by guest_id
        const filteredItems = response.data.items.filter(item => item.guest_id === user.ownerRezId);

        // Check if filteredItems is empty
        if (filteredItems.length === 0) {
            return res.status(404).json({ message: "No bookings found for this user" });
        }

        // Respond with the filtered items
        res.json(filteredItems);
    } catch (error) {
        // Handle errors with the request
        console.error(`Error: ${error.message}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

//user/userId/booking
app.get('/user/:userId/booking/:bookingId', async (req, res) => {

    //GET LANDMARKS


    // Get user from your database
    const user = await User.findById(req.params.userId);

    // Error handling in case user doesn't exist
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    // Get the bookingId from the params
    const bookingId = req.params.bookingId;

    // Make the request to the bookings endpoint to get the booking
    try {
        const response = await axios.get('https://api.ownerreservations.com/v2/bookings?limit=100', ownerRezConfig);

        // Find the booking
        const booking = response.data.items.find(item => item.id.toString() === bookingId && item.guest_id === user.ownerRezId);

        // Check if the booking exists
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        // If booking exists, send it as a response
        res.json(booking);
    } catch (error) {
        // Handle errors with the request
        console.error(`Error: ${error.message}`);
        res.status(500).json({ message: "An error occurred" });
    }
});


// user/userId/extend/bookingId

app.post('/user/:userId/booking/:bookingId/extend', async (req, res) => {
    // Get user from your database
    const user = await User.findById(req.params.userId);

    // Error handling in case user doesn't exist
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    // Get the bookingId from the params
    const bookingId = req.params.bookingId;

    // Get the newDepartureDate from the request body
    const newDepartureDate = req.body.newDepartureDate;

    // Make the request to the bookings endpoint to get the current booking
    try {
        const response = await axios.get('https://api.ownerreservations.com/v2/bookings?limit=100', ownerRezConfig);

        // Find the booking
        const booking = response.data.items.find(item => item.id.toString() === bookingId && item.guest_id === user.ownerRezId);

        // Check if the booking exists and is active
        if (!booking || booking.status !== "active") {
            return res.status(404).json({ message: "Active booking not found" });
        }

        // Extend the booking
        try {
            const extensionResponse = await extendBooking(bookingId, newDepartureDate);

            // Send the response of the extension
            res.json(extensionResponse);
        } catch (error) {
            console.error(`Error extending the booking: ${error.message}`);
            res.status(500).json({ message: "An error occurred while extending the booking" });
        }
    } catch (error) {
        // Handle errors with the request
        console.error(`Error: ${error.message}`);
        res.status(500).json({ message: "An error occurred" });
    }
});


// landlords/landlordId/profile GET PUT
// landlords/landlordId/overview
// landlords/landlordId/property/propertyId

app.get('/landlords/:landlordId/amounts', async (req, res) => {
    //in the body apply filters

})

app.get('/landlords/:landlordId/occupancies', async (req, res) => {
    //in the body apply filters
})

app.get('/landlords/:landlordId/arrivaldepartures', async (req, res) => {
    //in the body apply filters
})






//Implement the reviews

app.post('/newsletter', async (req, res) => {
    try {

        const existingSubscriber = await Subscriber.findOne({ email: req.body.email });
        if (existingSubscriber) {
            return res.status(400).send({ message: 'Email has already been subscribed.' });
        }

        const subscriber = new Subscriber(req.body);
        await subscriber.save();

        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'dev.olegovich@gmail.com',
                pass: 'vkjyrsggvnnukaei'
            }
        })

        let mailOptions = {
            from: 'dev.olegovich@gmail.com',
            to: subscriber.email,
            subject: 'Thank you for subscribing to our newsletter!',
            text: `You will be receiving news letters from Trophystays!`
        }

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error)
            } else {
                console.log('Email has been sent successfully: ' + info.response)
            }
        })

        res.send({ message: 'Thanks for subscribing!' });
    } catch (error) {
        res.status(500).send({ error: 'Could not subscribe.' });
    }
})







app.listen(PORT, console.log(`Listening on ${PORT}`))