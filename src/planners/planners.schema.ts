import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlannerDocument = Planner & Document;

@Schema({ collection: 'Planners' })
export class Planner {
  @Prop()
  subject: string;

  @Prop({ required: true })
  todo: string;

  @Prop({ required: true })
  date: string;

  @Prop()
  startTime: string;

  @Prop()
  endTime: string;

  @Prop()
  repeatDays: string[];

  @Prop({ default: 1 })
  repeatWeeks: number;

  @Prop({ default: false, required: true })
  isComplete: boolean;

  @Prop({ required: false })
  parentObjectId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: [{ startTime: String, endTime: String }] })
  timelineList: {
    startTime: string;
    endTime: string;
  }[];
}

export const PlannerSchema = SchemaFactory.createForClass(Planner);