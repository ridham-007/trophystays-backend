const fs = require('fs')
const csv = require('csv-parser')
const mongoose = require('mongoose')
const moment = require('moment')
const Occupancy = require('../models/occupancy')
const Amount = require('../models/amount')
const ArrivalDeparture = require('../models/arrivalDeparture')

const csvJson = require('csvtojson');



const path = require('path')
// CSV file path
const csvFilePathOcc = path.join(__dirname, '../data_imports/occupancy.csv')
const csvFilePathAmm = path.join(__dirname, '../data_imports/bookingdetail.csv')

// Connect to your database
mongoose.connect('mongodb://localhost:27017/trophystays', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to DB'))
    .catch(err => console.log('Error connecting to DB', err));


function getDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });
    const monthYear = formatter.format(now);
    return monthYear
}

const month = process.argv[2] || getDate()

async function occupancy() {
    return new Promise((resolve, reject) => {
        const results = [];

        const date = new Date()
        // date.setDate(date.getDate() + 1)
        const updatedLast = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`

        fs.createReadStream(csvFilePathOcc)
            .pipe(csv())
            .on('data', (data) => results.push({ property: data.Property, occupancy: data['% Occupied'] }))
            .on('end', async () => {
                const occupancyData = {
                    month: month,  // Replace this with the actual month
                    data: results,
                    updatedLast
                };

                try {
                    await Occupancy.updateOne({ month: month }, { $set: occupancyData }, { upsert: true });
                    console.log('Document updated successfully!');
                    resolve()
                } catch (err) {
                    console.error(err);
                    reject()
                }
            });
    })
}


async function getOccupancy(startDate, endDate, internalCode, ownerRezId) {
    // Get an array of months in the format 'MMM YYYY' between start and end dates
    function getMonths(start, end) {
        var startMonth = start.getMonth();
        var endMonth = end.getMonth();

        var months = [];
        for (var i = startMonth; i <= endMonth; i++) {
            // You can adjust this to use your preferred month format
            months.push(moment(start).month(i).format('MMM YYYY'));
        }

        return months;
    }

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);

        let months = getMonths(start, end);

        let data = await Occupancy.find({
            month: {
                $in: months
            }
        })
            .catch(err => console.error('Error in getOccupancy find:', err));

        let result = data.map(doc => {
            let filteredData = doc.data.filter(item => item.property === internalCode);
            return {
                month: doc.month,
                data: filteredData,
            };
        });

        return result;

    } catch (err) {
        console.error('Error in getOccupancy:', err);
    }
}

async function saveAmounts(csvFilePath) {
    const jsonArray = await csvJson().fromFile(csvFilePath);

    for (let row of jsonArray) {
        try {
            // Parse the date from the arrival date
            let date = new Date(row['Arrival']);
            let monthYear = moment(date).format('MMM YYYY');
            let day = date.getDate();

            // console.log(`Processing data for date ${day} ${monthYear}...`);

            // Find the document for the month
            let doc = await Amount.findOne({ month: monthYear });

            // If the document doesn't exist, create it with default values
            if (!doc) {
                console.log(`Creating new document for month ${monthYear}...`);
                const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                doc = new Amount({
                    month: monthYear,
                    data: Array.from({ length: daysInMonth }, (_, i) => ({
                        day: i + 1,
                        properties: []
                    }))
                });

                // Save the new document immediately
                await doc.save();
                // console.log(`Created and saved new document for month ${monthYear}.`);
            }

            // Find the data entry for the day
            let dayEntry = doc.data.find(d => d.day === day);

            // Check if the day entry exists
            if (!dayEntry) {
                // console.error(`Day entry not found for day ${day} in document for month ${monthYear}.`);
                continue;
            }

            // Check if the property already exists in the data
            let existing = dayEntry.properties.find(p => p.property === row['Property']);

            // Remove commas and convert owner amount to number
            row['Owner Amount'] = parseFloat(row['Owner Amount'].replace(/,/g, ''));

            // If the property exists and the ownerAmount is different, update it
            if (existing && existing.ownerAmount !== row['Owner Amount']) {
                // console.log(`Updating property ${row['Property']} for day ${day} in month ${monthYear}...`);
                existing.ownerAmount = row['Owner Amount'];
            }
            // Otherwise, if the property doesn't exist, add it
            else if (!existing) {
                // console.log(`Adding new property ${row['Property']} for day ${day} in month ${monthYear}...`);
                dayEntry.properties.push({
                    property: row['Property'],
                    ownerAmount: row['Owner Amount']
                });
            }

            // Save the document
            await doc.save();
            // console.log(`Saved document for month ${monthYear}.`);
        } catch (err) {
            // console.error('Error in saveAmounts:', err);
        }
    }
}

async function getAmounts(startDate, endDate, internalCode, removeEmptyDays = false) {
    // Get an array of months in the format 'MMM YYYY' between start and end dates
    function getMonths(start, end) {
        var startMonth = start.getMonth();
        var endMonth = end.getMonth();

        var months = [];
        for (var i = startMonth; i <= endMonth; i++) {
            months.push(moment(start).month(i).format('MMM YYYY'));
        }

        return months;
    }

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);

        let months = getMonths(start, end);

        let data = await Amount.find({
            month: {
                $in: months
            }
        })
            .catch(err => console.error('Error in getAmounts find:', err));

        let result = data.map(doc => {
            // Filter each day's properties for the specified internalCode
            let filteredData = doc.data.map(day => {
                let filteredProperties = day.properties.filter(prop => prop.property === internalCode);
                return {
                    day: day.day,
                    properties: filteredProperties,
                };
            });

            // If removeEmptyDays is true, filter out days with no properties
            if (removeEmptyDays) {
                filteredData = filteredData.filter(day => day.properties.length > 0);
            }

            return {
                month: doc.month,
                data: filteredData,
            };
        });

        return result;

    } catch (err) {
        console.error('Error in getAmounts:', err);
    }
}

async function saveArrivalDepartureData(csvFilePath) {
    const jsonArray = await csvJson().fromFile(csvFilePath);

    for (let row of jsonArray) {
        try {
            // Parse the date from the arrival and departure dates
            let arrivalDate = new Date(row['Arrival']);
            let departureDate = new Date(row['Departure']);

            // Extract the property code
            let propertyCode = row['Property'];

            // Format the month
            let monthYear = moment(arrivalDate).format('MMM YYYY');

            // Find the document for the month
            let doc = await ArrivalDeparture.findOne({ month: monthYear });

            // If the document doesn't exist, create it with default values
            if (!doc) {
                console.log(`Creating new document for month ${monthYear}...`);
                doc = new ArrivalDeparture({
                    month: monthYear,
                    data: [{
                        property: propertyCode,
                        dates: [{
                            arrival: arrivalDate,
                            departure: departureDate
                        }]
                    }]
                });
            } else {
                // If the document exists, find the property in it
                let propertyData = doc.data.find(d => d.property === propertyCode);

                // If the propertyData does not exist, create it
                if (!propertyData) {
                    propertyData = {
                        property: propertyCode,
                        dates: []
                    };
                    doc.data.push(propertyData);
                }

                let existingDate = propertyData.dates.find(d =>
                    d.arrival.getTime() === arrivalDate.getTime() &&
                    d.departure.getTime() === departureDate.getTime()
                );

                // If the date does not exist, add it
                if (!existingDate) {
                    propertyData.dates.push({
                        arrival: arrivalDate,
                        departure: departureDate
                    });
                }
            }

            // Save the document
            await doc.save();
            console.log(`Saved document for month ${monthYear}.`);
        } catch (err) {
            console.error('Error in saveArrivalDepartureData:', err);
        }
    }
}

async function getArrivalDepartureData(startDate, endDate, propertyCode) {
    try {
        // Parse the dates and month to the required format
        let start = new Date(startDate);
        let end = new Date(endDate);
        let monthYear = moment(start, 'YYYY-MM-DD').format('MMM YYYY');

        // Find the document for the month
        let doc = await ArrivalDeparture.findOne({ month: monthYear });

        // If the document doesn't exist, return a message
        if (!doc) {
            console.log(`No document found for month ${monthYear}.`);
            return;
        }

        // If the document exists, find the property in it
        let propertyData = doc.data.find(d => d.property === propertyCode);

        // If the propertyData does not exist, return a message
        if (!propertyData) {
            console.log(`No property data found for property ${propertyCode} in month ${monthYear}.`);
            return;
        }

        // Filter the dates within the start and end dates
        let filteredDates = propertyData.dates.filter(d => d.arrival >= start && d.departure <= end);

        // Return the filtered dates
        console.log(`Retrieved data for property ${propertyCode} in month ${monthYear} within ${startDate} and ${endDate}:`, filteredDates);
        return filteredDates;
    } catch (err) {
        console.error('Error in getArrivalDepartureData:', err);
    }
}

async function main() {
    try {
        let results = await Promise.all([
            saveAmounts(csvFilePathAmm),
            getAmounts('2023-07-01', '2023-07-31', '2407-DV1-DWTN', true),
            saveArrivalDepartureData(csvFilePathAmm),
            getArrivalDepartureData('2023-07-01', '2023-07-31', '2407-DV1-DWTN')
        ]);

        console.log('Results:', JSON.stringify(results, null, 2));
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        mongoose.connection.close();
    }
}






main()

