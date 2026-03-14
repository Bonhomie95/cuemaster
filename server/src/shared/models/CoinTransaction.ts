// File: server/src/shared/models/CoinTransaction.ts

import mongoose, { Schema, Document, Model } from 'mongoose';
import { CoinTransactionType } from '../types/coin';

export interface ICoinTransactionDocument extends Document {
  userId:       mongoose.Types.ObjectId;
  type:         CoinTransactionType;
  amount:       number;
  balanceAfter: number;
  description:  string;
  referenceId?: string;
  issuedBy?:    mongoose.Types.ObjectId;
}

const CoinTransactionSchema = new Schema<ICoinTransactionDocument>(
  {
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:         { type: String, enum: Object.values(CoinTransactionType), required: true },
    amount:       { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    description:  { type: String, required: true, maxlength: 255 },
    referenceId:  String,
    issuedBy:     { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

CoinTransactionSchema.index({ userId: 1, createdAt: -1 });

// Immutability guard — never update a transaction, only insert
CoinTransactionSchema.pre(['updateOne', 'findOneAndUpdate'], function () {
  throw new Error('[CoinTransaction] Transactions are immutable.');
});

export const CoinTransaction: Model<ICoinTransactionDocument> =
  mongoose.model<ICoinTransactionDocument>('CoinTransaction', CoinTransactionSchema);
