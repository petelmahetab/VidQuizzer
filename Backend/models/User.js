
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';


const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    avatar: {
        type: String,
        default: null
    },
    plan: {
        type: String,
        enum: ['free', 'premium'],
        default: 'free'
    },
    usage: {
        videosProcessed: {
            type: Number,
            default: 0
        },
        monthlyLimit: {
            type: Number,
            default: 10
        },
        lastReset: {
            type: Date,
            default: Date.now
        }
    },
    preferences: {
        summaryLength: {
            type: String,
            enum: ['brief', 'detailed', 'comprehensive'],
            default: 'detailed'
        },
        language: {
            type: String,
            default: 'en'
        },
        autoGenerateQuestions: {
            type: Boolean,
            default: true
        }
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user can process more videos
userSchema.methods.canProcessVideo = function () {
    const now = new Date();
    const lastReset = new Date(this.usage.lastReset);
    const monthDiff = (now.getFullYear() - lastReset.getFullYear()) * 12 +
        (now.getMonth() - lastReset.getMonth());

    if (monthDiff >= 1) {
        this.usage.videosProcessed = 0;
        this.usage.lastReset = now;
    }

    return this.usage.videosProcessed < this.usage.monthlyLimit;
};

export default mongoose.model('User', userSchema);