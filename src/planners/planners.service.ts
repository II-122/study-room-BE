import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Planner } from './planners.schema';

@Injectable()
export class PlannersService {
  constructor(
    @InjectModel(Planner.name) private plannerModel: Model<Planner>
  ) {}

  private readonly mappingDays: { [key: string]: number } = {
    월: 0,
    화: 1,
    수: 2,
    목: 3,
    금: 4,
    토: 5,
    일: 6,
  };

  async createPlan(userId: string, plannerDto: Partial<Planner>): Promise<any> {
    try {
      let createDataNum = 0;
      const date = new Date(plannerDto.date); // 할 일을 생성하는 날짜
      const repeatDays = plannerDto.repeatDays;
      const repeatEndDate = new Date(plannerDto.repeatEndDate);

      if (plannerDto.repeatEndDate === undefined) {
        // 반복 요일이 존재하지 않는 할 일 저장
        const newPlanQuery = new this.plannerModel({
          ...plannerDto,
          userId: new Types.ObjectId(userId),
        });

        const savedPlan = await newPlanQuery.save();
        console.log('단일 데이터 생성 성공');
        console.log(savedPlan);

        return savedPlan;
      } else {
        const sortedDaysArray = repeatDays
          .map((day) => this.mappingDays[day])
          .sort((a, b) => {
            if (a === 6) return 1;
            if (b === 6) return -1;
            return a - b;
          });
        console.log(
          `${plannerDto.date} ~ ${plannerDto.repeatEndDate} 에 ${repeatDays} 요일 반복`
        );

        const dateArray: string[] = [];
        for (
          let setUpDate = date;
          setUpDate <= repeatEndDate;
          setUpDate.setDate(setUpDate.getDate() + 1)
        ) {
          const currentDay = (setUpDate.getDay() + 6) % 7;

          if (sortedDaysArray.includes(currentDay)) {
            dateArray.push(setUpDate.toISOString().split('T')[0]);
          }
        }
        dateArray.sort();

        let rootId: Types.ObjectId;

        for (let i: number = 0; i < dateArray.length; i++) {
          if (i === 0) {
            const newPlanQuery = new this.plannerModel({
              ...plannerDto,
              date: dateArray[0],
              userId: new Types.ObjectId(userId),
            });

            const savedPlan = await newPlanQuery.save();
            rootId = new Types.ObjectId(savedPlan._id);
          } else {
            await this.createPlanCascade(
              userId,
              rootId,
              dateArray[i],
              plannerDto
            );
          }
          createDataNum += 1;
        }
        console.log(`${createDataNum} 개의 데이터가 생성되었습니다.`);
        return `${createDataNum} 개의 데이터가 생성되었습니다.`;
      }
    } catch (error) {
      console.log(error);
    }
  }

  private async createPlanCascade(
    userId: string,
    parentId: Types.ObjectId,
    plannerDate: string,
    plannerDto: Partial<Planner>
  ): Promise<Planner> {
    const newChildPlanQuery = new this.plannerModel({
      ...plannerDto,
      date: plannerDate,
      userId: new Types.ObjectId(userId),
      parentObjectId: new Types.ObjectId(parentId),
    });

    return await newChildPlanQuery.save();
  }

  async showAll(userId: string, date: string): Promise<Planner[]> {
    const planners = await this.plannerModel
      .aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            date: date,
          },
        },
        {
          $addFields: {
            sortField: {
              $cond: {
                if: {
                  $or: [
                    { $not: ['$startTime'] },
                    { $eq: ['$startTime', null] },
                    { $eq: ['$startTime', ''] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
        },
        {
          $sort: {
            sortField: 1, // 빈 값이 있는 경우 마지막에 오도록 정렬
            startTime: 1,
          },
        },
        {
          $project: {
            sortField: 0, // sortField 필드를 결과에서 제거
            userId: 0,
          },
        },
      ])
      .exec();

    console.log('데이터 조회');
    return planners;
  }

  async updatePlan(
    userId: string,
    plannerId: string,
    plannerDto: Partial<Planner>
  ): Promise<any> {
    const {
      date,
      parentObjectId,
      totalTime,
      timelineList,
      ...updatePlannerDto
    } = plannerDto;

    const isHaveRepetition = !(
      plannerDto.repeatDays.length === 0 ||
      plannerDto.repeatEndDate === undefined
    );
    const isHaveParent = !(plannerDto.parentObjectId === undefined);

    if (isHaveParent === false && isHaveRepetition === false) {
      await this.plannerModel
        .findByIdAndUpdate(new Types.ObjectId(plannerId), updatePlannerDto, {
          new: true,
        })
        .exec();
      console.log(`단일 할 일 업데이트`);
    } else if (isHaveRepetition === true) {
      let rootId = new Types.ObjectId(plannerId);
      if (isHaveParent === true) {
        rootId = new Types.ObjectId(parentObjectId);
      }

      // 기준 날짜 이후 데이터 삭제
      console.log(rootId);
      const deleteResult = await this.plannerModel.deleteMany({
        date: { $gt: date },
        parentObjectId: rootId,
      });
      console.log(`${deleteResult.deletedCount}개의 데이터가 삭제되었습니다.`);

      // 반복 요일 매핑
      const repeatDays = plannerDto.repeatDays;
      const sortedDaysArray = repeatDays
        .map((day) => this.mappingDays[day])
        .sort((a, b) => {
          if (a === 6) return 1;
          if (b === 6) return -1;
          return a - b;
        });
      console.log(
        `${plannerDto.date} ~ ${plannerDto.repeatEndDate} 에 ${repeatDays} 요일 반복`
      );

      const standardDate = new Date(date);
      if (sortedDaysArray.includes((standardDate.getDay() + 6) % 7)) {
        const standardDate = new Date(date);
        standardDate.setDate(standardDate.getDate() - 1);
        const dayAgo = standardDate.toISOString().split('T')[0]; // 기준일 하루 전

        // 기준 날짜 이전(기준 날짜 미포함)의 묶인 데이터들의 repeatEndDate를 기준 날짜 하루 전으로 설정
        await this.plannerModel.findByIdAndUpdate(
          rootId,
          { $set: { repeatEndDate: dayAgo } },
          { new: true }
        );

        await this.plannerModel.updateMany(
          {
            parentObjectId: rootId,
            date: { $lt: date },
          },
          { $set: { repeatEndDate: dayAgo } }
        );
      } else {
        // 기존 날짜 이전(기존 날짜 포함) 데이터들의 repeatEndDate를 standardDate로 설정
        await this.plannerModel.findByIdAndUpdate(
          rootId,
          { $set: { repeatEndDate: date } },
          { new: true }
        );

        await this.plannerModel.updateMany(
          {
            parentObjectId: rootId,
            date: { $lt: date },
          },
          { $set: { repeatEndDate: date } }
        );
      }

      // 재생성 해야 하는 날짜들의 데이터 계산
      const dateArray: string[] = [];
      const repeatEndDate = new Date(plannerDto.repeatEndDate);
      for (
        let setUpDate = new Date(date);
        setUpDate <= repeatEndDate;
        setUpDate.setDate(setUpDate.getDate() + 1)
      ) {
        const currentDay = (setUpDate.getDay() + 6) % 7;

        if (sortedDaysArray.includes(currentDay)) {
          dateArray.push(setUpDate.toISOString().split('T')[0]);
        }
      }
      dateArray.sort();

      // 재생성
      let newRootId: Types.ObjectId;
      let createDataNum = 0;

      for (let i: number = 0; i < dateArray.length; i++) {
        if (i === 0) {
          // 만약 재생성 해야 하는 날짜가 오늘이라면 오늘 할 일을 업데이트, newRootId = new Types.ObjectId(plannerId)
          if (dateArray[i] === date) {
            await this.plannerModel.findByIdAndUpdate(
              new Types.ObjectId(plannerId),
              {
                $set: updatePlannerDto,
                $unset: { parentObjectId: '' },
              },
              { new: true }
            );
            newRootId = new Types.ObjectId(plannerId);
          } else {
            // 아니라면 날짜 배열의 첫 번째 _id를 newRootId로 설정하고 나머지 할 일 재생성
            const newPlanQuery = new this.plannerModel({
              ...plannerDto,
              date: dateArray[0],
              userId: new Types.ObjectId(userId),
            });

            const savedPlan = await newPlanQuery.save();
            newRootId = new Types.ObjectId(savedPlan._id);
          }
        } else {
          await this.createPlanCascade(
            userId,
            newRootId,
            dateArray[i],
            plannerDto
          );
        }
        createDataNum += 1;
      }
      console.log(`${createDataNum} 개의 데이터가 수정 or 재생성되었습니다.`);
    } else if (isHaveParent === true && isHaveRepetition === false) {
      const rootId = new Types.ObjectId(parentObjectId);
      // 기준 날짜 이후의 묶인 데이터들 삭제
      const deleteResult = await this.plannerModel.deleteMany({
        date: { $gt: date },
        parentObjectId: rootId,
      });
      console.log(`${deleteResult.deletedCount}개의 데이터가 삭제되었습니다.`);

      // 기준 날짜 이전(기존 날짜 포함)의 묶인 데이터들(부모 데이터 포함)의 repeatEndDate = date
      await this.plannerModel.findByIdAndUpdate(
        rootId,
        { $set: { repeatEndDate: date } },
        { new: true }
      );

      await this.plannerModel.updateMany(
        {
          parentObjectId: rootId,
          date: { $lte: date },
        },
        { $set: { repeatEndDate: date } }
      );

      // 마지막 할 일의 내용 update, 반복 요일을 부모 데이터의 반복 요일로 설정
      const rootData = await this.plannerModel.findById(rootId);
      await this.plannerModel.findByIdAndUpdate(
        new Types.ObjectId(plannerId),
        { ...updatePlannerDto, repeatDays: rootData.repeatDays },
        { new: true }
      );
    }
  }

  async deletePlan(userId: string, plannerId: string): Promise<Planner> {
    const deletePlanQuery = await this.plannerModel
      .findByIdAndDelete({
        _id: new Types.ObjectId(plannerId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    return deletePlanQuery;
  }

  // private async deletePlanCascade(
  //   parentId: Types.ObjectId,
  //   todayString: string
  // ): Promise<any> {
  //   const deleteCascadePlanQuery = await this.plannerModel.deleteMany({
  //     parentObjectId: new Types.ObjectId(parentId),
  //     date: { $gt: todayString },
  //   });

  //   console.log(
  //     `${deleteCascadePlanQuery.deletedCount} 개의 데이터가 삭제되었습니다.`
  //   );
  // }

  async toggleIsComplete(userId: string, plannerId: string): Promise<Planner> {
    const planner = await this.plannerModel.findOne({
      _id: new Types.ObjectId(plannerId),
      userId: new Types.ObjectId(userId),
    });
    if (!planner) {
      throw new NotFoundException(`${plannerId} is not found`);
    }

    planner.isComplete = !planner.isComplete;

    return await planner.save();
  }

  async find(
    userId: string,
    date: string,
    projectionFields?: Record<string, boolean>
  ): Promise<Planner[]> {
    return await this.plannerModel
      .find(
        {
          userId: new Types.ObjectId(userId),
          date,
        },
        projectionFields
      )
      .lean();
  }
}