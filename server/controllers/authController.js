import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import userModel from '../models/userModel.js'

const createToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' })

// Mongoose passes query values through as-is, so an object like { $gt: '' } in place
// of a string turns a `findOne({ email })` lookup into a NoSQL operator injection —
// requiring a plain string here closes that off before it reaches the database.
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

export const register = async (req, res) => {
  const { name, email, password } = req.body
  if (![name, email, password].every(isNonEmptyString))
    return res.status(400).json({ success: false, message: 'All fields required' })
  try {
    if (await userModel.findOne({ email }))
      return res.status(400).json({ success: false, message: 'Email already in use' })
    const hashed = await bcrypt.hash(password, 10)
    const user = await userModel.create({ name, email, password: hashed })
    res.status(201).json({
      success: true,
      token: createToken(user._id),
      user: { name: user.name, email: user.email },
    })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

export const login = async (req, res) => {
  const { email, password } = req.body
  if (![email, password].every(isNonEmptyString))
    return res.status(400).json({ success: false, message: 'All fields required' })
  try {
    const user = await userModel.findOne({ email })
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' })
    res.json({
      success: true,
      token: createToken(user._id),
      user: { name: user.name, email: user.email },
    })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}
