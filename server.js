const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv').config()
const mongoose = require('mongoose')
const axios = require('axios')


mongoose.connect(process.env.MONGO_URI).then(()=> console.log("connected to db")).catch((err) => console.log(err))


const app = express()

//middlewares
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({extended: true}))


// basic routes
app.get('/api/v1/analysis/:username', (req, res) => {
    const username = req.params.username
    console.log(username)
})


app.listen(3000, ()=> {
    console.log("server is running on port 3000")
})