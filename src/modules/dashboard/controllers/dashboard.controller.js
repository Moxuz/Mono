// src/modules/dashboard/controllers/dashboard.controller.js

const SecurityAudit = require('../../../shared/models/SecurityAudit');
const mongoose = require('mongoose');
const logger = require('../../../shared/utils/logger');

// ดึงข้อมูลจำนวน login ของ user ย้อนหลัง 7 วัน พร้อมรองรับ timezone
exports.getLoginActivity = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            logger.error('Get login activity - No user ID');
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        // รับ timezone offset จาก client (หน่วยเป็นนาที)
        const timezoneOffset = parseInt(req.query.offset || 0);

        logger.info(`Getting login activity for user: ${userId}, timezone offset: ${timezoneOffset}`);

        // คำนวณช่วงวันที่ตาม timezone ของ user
        const now = new Date();
        const endDate = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 6);

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        logger.info(`Date range (user timezone): ${startDate.toISOString()} to ${endDate.toISOString()}`);

        // แปลง userId เป็น ObjectId
        let userObjectId;
        try {
            userObjectId = new mongoose.Types.ObjectId(userId);
        } catch (error) {
            logger.error('Invalid user ID format:', { userId, error: error.message });
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID format'
            });
        }

        // Aggregate ข้อมูล login แบ่งตามวันที่ปรับ timezone แล้ว
        const loginActivity = await SecurityAudit.aggregate([
            {
                $match: {
                    userId: userObjectId,
                    action: 'login_success',
                    createdAt: {
                        $gte: startDate,
                        $lte: endDate
                    }
                }
            },
            {
                $addFields: {
                    // แปลงวันที่ให้ตรงกับ timezone ของ user
                    localDate: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: {
                                $add: [
                                    '$createdAt',
                                    -timezoneOffset * 60 * 1000
                                ]
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$localDate',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        logger.info(`Found ${loginActivity.length} days with login activity`, {
            userId,
            results: loginActivity
        });

        // สร้าง array ครอบคลุมทุกวัน (รวมวันที่ไม่มี login)
        const days = [];
        const data = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const dateStr = date.toISOString().split('T')[0];
            const dayName = dayNames[date.getDay()];

            const found = loginActivity.find(item => item._id === dateStr);
            const count = found ? found.count : 0;

            days.push(dayName);
            data.push(count);
        }

        // คำนวณสถิติสรุป
        const totalLogins = data.reduce((sum, count) => sum + count, 0);
        const avgPerDay = (totalLogins / 7).toFixed(1);
        const maxDay = Math.max(...data);
        const trend = totalLogins === 0 ? 'stable' :
                     data[6] > data[0] ? 'up' :
                     data[6] < data[0] ? 'down' : 'stable';

        logger.info(`Login activity stats:`, {
            userId,
            total: totalLogins,
            average: avgPerDay,
            max: maxDay,
            trend,
            days,
            counts: data
        });

        res.json({
            success: true,
            data: {
                days,
                counts: data,
                stats: {
                    total: totalLogins,
                    average: parseFloat(avgPerDay),
                    max: maxDay,
                    trend
                }
            }
        });
    } catch (error) {
        logger.error('Get login activity error:', {
            message: error.message,
            stack: error.stack,
            userId: req.user?.id,
            name: error.name
        });

        res.status(500).json({
            success: false,
            error: 'Failed to get login activity',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
