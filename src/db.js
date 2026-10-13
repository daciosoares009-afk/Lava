import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoose.model('User').init();
}

export function databaseReady() {
  return mongoose.connection.readyState === 1;
}
