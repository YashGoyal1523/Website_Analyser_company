import jwt from 'jsonwebtoken'

const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Not authorised' })
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET)
    req.userId = decoded.id
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Not authorised' })
  }
}

export default authMiddleware
