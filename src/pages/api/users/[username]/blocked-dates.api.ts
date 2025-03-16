/* eslint-disable camelcase */
import { prisma } from '@/lib/prisma'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { NextApiRequest, NextApiResponse } from 'next'
dayjs.extend(utc)
dayjs.extend(timezone)

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }
  const username = String(req.query.username)
  const { year, month } = req.query

  if (!year || !month) {
    return res.status(400).json({ message: 'Year or month not specified.' })
  }

  const user = await prisma.user.findUnique({
    where: { username },
  })

  if (!user) {
    return res.status(400).json({ message: 'User does not exist.' })
  }

  const availableWeekDays = await prisma.userTimeInterval.findMany({
    select: {
      week_day: true,
    },
    where: {
      user_id: user.id,
    },
  })

  const blockedWeekDays = [0, 1, 2, 3, 4, 5, 6].filter((weekDay) => {
    return !availableWeekDays.some(
      (availableWeekDay) => availableWeekDay.week_day === weekDay,
    )
  })

  const blockedDatesRaw: Array<{ date: number }> = await prisma.$queryRaw`
    SELECT
    EXTRACT(DAY FROM s.date) AS date,
    COUNT(s.date) AS amount,
    ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60) AS size
    FROM
        schedulings s
    LEFT JOIN
        user_time_intervals uti ON uti.week_day = EXTRACT(DOW FROM s.date)
    WHERE
        s.user_id = ${user.id} AND TO_CHAR(s.date, 'YYYY-MM') = ${`${year}-${month}`}
    GROUP BY
        EXTRACT(DAY FROM s.date),
        ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60)
    HAVING
        COUNT(s.date) >= ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60)
 `

  const referenceDate = dayjs().tz('America/Sao_Paulo')
  console.log('DATA DE REFERENCIA: ' + referenceDate)
  const today = referenceDate.date()

  const blockedDates = blockedDatesRaw
    .map((item) => Number(item.date))
    .filter((date) => date >= today)

  const todayTimestamp = referenceDate.startOf('day').valueOf()
  const userAvailability = await prisma.userTimeInterval.findMany({
    select: {
      time_start_in_minutes: true,

      time_end_in_minutes: true,
    },

    where: {
      user_id: user.id,

      week_day: referenceDate.get('day'),
    },
  })

  if (userAvailability && userAvailability.length > 0) {
    const time_end_in_minutes = userAvailability[0]?.time_end_in_minutes

    if (time_end_in_minutes !== undefined) {
      const startOfDay = referenceDate.startOf('day')
      const endTime = startOfDay.add(time_end_in_minutes, 'minutes')
      const isPassedAllDay = endTime.isBefore(referenceDate)

      if (isPassedAllDay) {
        blockedDates.push(todayTimestamp)
      }
    } else {
      console.warn(
        'time_end_in_minutes is undefined for user:',
        user.id,
        'weekDay:',
        referenceDate.get('day'),
      )
    }
  } else {
    console.warn(
      'userAvailability is empty for user:',
      user.id,
      'weekDay:',
      referenceDate.get('day'),
    )
  }

  return res.json({ blockedWeekDays, blockedDates })
}
