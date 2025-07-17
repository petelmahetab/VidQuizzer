import express from 'express'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import cors from 'cors'



const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors())
dotenv.config();

app.get('/', (req, res) => {
  res.send('Hello World')
  console.log(Youtube_Key)
})

const Port=process.env.Port;
const Youtube_Key=process.env.YOUTUBE_API_KEY;

app.listen(Port,()=>{
    console.log(`Server is running on port ${Port}`)
})
