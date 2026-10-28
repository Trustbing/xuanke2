import { kv } from '@vercel/kv';

// 管理密码，建议部署后在Vercel环境变量修改
const ADMIN_PASSWORD = process.env.ADMIN_PWD || 'admin123';

// 初始化默认课程
async function initData() {
  const exists = await kv.exists('xk_courses');
  if (!exists) {
    const defaultCourses = [
      { id: 1, name: 'Python编程入门', teacher: '张老师', quota: 30 },
      { id: 2, name: '创意机器人搭建', teacher: '李老师', quota: 20 },
      { id: 3, name: '动漫设计与制作', teacher: '王老师', quota: 25 },
      { id: 4, name: '科学实验探究', teacher: '陈老师', quota: 20 },
      { id: 5, name: '硬笔书法', teacher: '刘老师', quota: 35 },
      { id: 6, name: '合唱社团', teacher: '赵老师', quota: 40 }
    ];
    await kv.set('xk_courses', defaultCourses);
  }
  const recordsExists = await kv.exists('xk_records');
  if (!recordsExists) {
    await kv.set('xk_records', []);
  }
}

export default async function handler(req, res) {
  await initData();
  
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  const action = req.body?.action || req.query?.action || '';
  const body = req.body || {};

  // 1. 获取课程列表
  if (action === 'getCourses') {
    const courses = await kv.get('xk_courses') || [];
    return res.status(200).json({ code: 0, data: courses });
  }

  // 2. 获取选课记录
  if (action === 'getRecords') {
    const records = await kv.get('xk_records') || [];
    return res.status(200).json({ code: 0, data: records });
  }

  // 3. 学生提交选课
  if (action === 'submitSelect') {
    const stuName = (body.stuName || '').trim();
    const stuClass = (body.stuClass || '').trim();
    const courseId = parseInt(body.courseId || 0);

    // 格式校验
    if (!/^[\u4e00-\u9fa5]+$/.test(stuName)) {
      return res.status(200).json({ code: 1, msg: '姓名必须为纯中文汉字' });
    }
    if (!/^\d{3}$/.test(stuClass)) {
      return res.status(200).json({ code: 1, msg: '班级必须为3位数字编码' });
    }

    const courses = await kv.get('xk_courses') || [];
    const course = courses.find(c => c.id === courseId);
    if (!course) {
      return res.status(200).json({ code: 1, msg: '课程不存在' });
    }

    const records = await kv.get('xk_records') || [];
    const stuKey = `${stuClass}_${stuName}`;

    // 检查是否已选课
    if (records.some(r => r.stuKey === stuKey)) {
      return res.status(200).json({ code: 1, msg: '您已完成选课，不可重复提交' });
    }

    // 后端校验名额
    const selectedCount = records.filter(r => r.courseId === courseId).length;
    if (selectedCount >= course.quota) {
      return res.status(200).json({ code: 1, msg: '抱歉，该课程名额已满' });
    }

    // 写入记录
    records.push({
      stuKey,
      stuName,
      stuClass,
      courseId,
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    });
    await kv.set('xk_records', records);

    return res.status(200).json({ code: 0, msg: '选课成功', courseName: course.name });
  }

  // 管理员操作鉴权
  const adminActions = ['saveCourse', 'deleteCourse', 'deleteRecord', 'clearRecords'];
  if (adminActions.includes(action)) {
    const pwd = body.password || '';
    if (pwd !== ADMIN_PASSWORD) {
      return res.status(200).json({ code: 1, msg: '管理密码错误' });
    }
  }

  // 4. 保存课程（新增/编辑）
  if (action === 'saveCourse') {
    const id = parseInt(body.id || 0);
    const name = (body.name || '').trim();
    const teacher = (body.teacher || '').trim();
    const quota = parseInt(body.quota || 0);

    if (!name || !teacher || quota < 1) {
      return res.status(200).json({ code: 1, msg: '请填写完整信息，人数上限至少为1' });
    }

    const courses = await kv.get('xk_courses') || [];
    const records = await kv.get('xk_records') || [];

    if (id > 0) {
      // 编辑
      const selectedCount = records.filter(r => r.courseId === id).length;
      if (quota < selectedCount) {
        return res.status(200).json({ code: 1, msg: `名额不能小于当前已选人数（${selectedCount}人）` });
      }
      const idx = courses.findIndex(c => c.id === id);
      if (idx > -1) {
        courses[idx] = { ...courses[idx], name, teacher, quota };
      }
    } else {
      // 新增
      const newId = courses.length ? Math.max(...courses.map(c => c.id)) + 1 : 1;
      courses.push({ id: newId, name, teacher, quota });
    }

    await kv.set('xk_courses', courses);
    return res.status(200).json({ code: 0, msg: '保存成功' });
  }

  // 5. 删除课程
  if (action === 'deleteCourse') {
    const id = parseInt(body.id || 0);
    let courses = await kv.get('xk_courses') || [];
    let records = await kv.get('xk_records') || [];

    // 清除相关选课记录
    records = records.filter(r => r.courseId !== id);
    courses = courses.filter(c => c.id !== id);

    await kv.set('xk_courses', courses);
    await kv.set('xk_records', records);
    return res.status(200).json({ code: 0, msg: '删除成功' });
  }

  // 6. 删除单条选课记录
  if (action === 'deleteRecord') {
    const stuKey = body.stuKey || '';
    let records = await kv.get('xk_records') || [];
    records = records.filter(r => r.stuKey !== stuKey);
    await kv.set('xk_records', records);
    return res.status(200).json({ code: 0, msg: '删除成功' });
  }

  // 7. 清空所有选课记录
  if (action === 'clearRecords') {
    await kv.set('xk_records', []);
    return res.status(200).json({ code: 0, msg: '已清空所有选课记录' });
  }

  return res.status(200).json({ code: 1, msg: '无效请求' });
}
