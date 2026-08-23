import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (process.env.NODE_ENV === "production" && SECRET === "dev_secret_change_me") {
  // eslint-disable-next-line no-console
  console.error(
    "⚠️  JWT_SECRET is not set in production! Anyone can forge login tokens. " +
      "Set a long random JWT_SECRET in your environment variables immediately."
  );
}

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
