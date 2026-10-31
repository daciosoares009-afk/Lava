import mongoose from 'mongoose';
import { getDatabaseBackend, getSupabaseClient } from './db.js';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  service: { type: String, required: true, minlength: 3, maxlength: 120 },
  preferredDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  notes: { type: String, default: '', maxlength: 1000 },
  status: { type: String, enum: ['pending', 'cancelled'], default: 'pending' },
  revision: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });
schema.index({ userId: 1, createdAt: -1, _id: -1 });
export const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', schema);
const mongo = () => getDatabaseBackend() === 'mongo';
const columns = 'id,service,preferred_date,notes,status,revision,created_at,updated_at';
function publicRow(row) {
  return { id: String(row.id), service: row.service, preferredDate: row.preferred_date ?? row.preferredDate,
    notes: row.notes, status: row.status, revision: row.revision,
    staffMessage: row.staff_message || '', createdAt: row.created_at ?? row.createdAt, updatedAt: row.updated_at ?? row.updatedAt };
}
async function result(query) { const { data, error } = await query; if (error) throw error; return data; }
function record(value) { return { service: value.service, preferred_date: value.preferredDate, notes: value.notes }; }
export const appointments = {
  async overview(userId, today) {
    if (mongo()) {
      const filter = { userId, status: { $in: ['pending', 'confirmed'] }, preferredDate: { $gte: today } };
      const [upcomingCount, next, recent] = await Promise.all([Appointment.countDocuments(filter), Appointment.findOne(filter).sort({ preferredDate: 1, _id: 1 }), Appointment.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(5)]);
      return { upcomingCount, next: next ? publicRow(next) : null, recent: recent.map(publicRow) };
    }
    const client = getSupabaseClient();
    const [count, next, recent] = await Promise.all([
      client.from('appointment_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['pending', 'confirmed']).gte('preferred_date', today),
      client.from('appointment_requests').select(columns).eq('user_id', userId).in('status', ['pending', 'confirmed']).gte('preferred_date', today).order('preferred_date').order('id').limit(1),
      client.from('appointment_requests').select(columns).eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(5),
    ]);
    for (const result of [count, next, recent]) if (result.error) throw result.error;
    return { upcomingCount: count.count, next: next.data[0] ? publicRow(next.data[0]) : null, recent: recent.data.map(publicRow) };
  },
  async create(userId, value) {
    const row = mongo() ? await Appointment.create({ ...value, userId })
      : await result(getSupabaseClient().from('appointment_requests').insert({ ...record(value), user_id: userId }).select(columns).single());
    return publicRow(row);
  },
  async list(userId, { status, page, includeStaff = false }) {
    const offset = (page - 1) * 20;
    let rows;
    if (mongo()) rows = await Appointment.find({ userId, ...(status ? { status } : {}) }).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(21);
    else {
      let query = getSupabaseClient().from('appointment_requests').select(columns + (includeStaff ? ',staff_message' : '')).eq('user_id', userId);
      if (status) query = query.eq('status', status);
      rows = await result(query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 20));
    }
    return { appointments: rows.slice(0, 20).map(publicRow), hasMore: rows.length > 20, page };
  },
  async change(userId, id, revision, value) {
    if (mongo() ? !/^[a-f0-9]{24}$/i.test(id) : !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return null;
    const update = value ? record(value) : { status: 'cancelled' };
    let row;
    if (mongo()) row = await Appointment.findOneAndUpdate({ _id: id, userId, status: 'pending', revision }, {
      $set: value || { status: 'cancelled' }, $inc: { revision: 1 },
    }, { new: true, runValidators: true });
    else row = await result(getSupabaseClient().from('appointment_requests').update({ ...update, revision: revision + 1 })
      .eq('id', id).eq('user_id', userId).eq('status', 'pending').eq('revision', revision).select(columns).maybeSingle());
    return row ? publicRow(row) : null;
  },
};
