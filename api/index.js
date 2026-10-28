import { put, get } from '@vercel/blob';

// 管理密码，建议在Vercel环境变量中配置ADMIN_PWD
const ADMIN_PASSWORD = process.env.ADMIN_PWD || 'admin123';

// 读取JSON文件
async function readJsonFile(filename) {
  try {
    const { body } = await get(filename);
    const text = await body.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// 写入JSON文件（覆盖式写入）
async function writeJsonFile(filename, data) {
  await put(filename, JSON.stringify(data), {
    contentType: 'application/json',
    access: 'private'
  });
}

// 初始化默认数据
async function initData() {
  const courses = await readJsonFile('courses.json');
  if (!courses) {
    const defaultCourses = [
      { id: 1, name: 'Python编程入门', teacher: '张老师', quota: 30 },
      { id: 2, name: '创意机器人搭建', teacher: '李老师', quota: 20 },
      { id: 3, name: '动漫设计与制作', teacher: '王老师', quota: 25 },
      { id: 4, name: '科学实验探究', teacher: '陈老师', quota: 20 },
      { id: 5, name: '硬笔书法', teacher: '刘老师', quota: 35 },
      { id: 6, name: '合唱社团', teacher: '赵老师', quota: 40 }
    ];
    await writeJsonFile('courses.json', defaultCourses);
  }
  const records = await readJsonFile('records.json');
  if (!records) {
    await writeJsonFile('records.json', []);
  }
}

export default async function handler(req, res) {
  await initData();
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  const action = req.body?.action || req.query?.action || '';
  const body = req.body || {};

  // 1. 获取课程列表
  if (action === 'getCourses') {
    const courses = await readJsonFile('courses.json') || [];
    return res.status(200).json({ code: 0, data: courses });
  }

  // 2. 获取选课记录
  if (action === 'getRecords') {
    const records = await readJsonFile('records.json') || [];
    return res.status(200).json({ code: 0, data: records });
  }

  // 3. 学生提交选课
  if (action === 'submitSelect') {
    const stuName = (body.stuName || '').trim();
    const stuClass = (body.stuClass || '').trim();
    const courseId = parseInt(body.courseId || 0);

    if (!/^[\u4e00-\u9fa5]+$/.test(stuName)) {
      return res.status(200).json({ code: 1, msg: '姓名必须为纯中文汉字' });
    }
    if (!/^\d{3}$/.test(stuClass)) {
      return res.status(200).json({ code: 1, msg: '班级必须为3位数字编码' });
    }

    const courses = await readJsonFile('courses.json') || [];
    const course = courses.find(c => c.id === courseId);
    if (!course) {
      return res.status(200).json({ code: 1, msg: '课程不存在' });
    }

    const records = await readJsonFile('records.json') || [];
    const stuKey = `${stuClass}_${stuName}`;

    if (records.some(r => r.stuKey === stuKey)) {
      return res.status(200).json({ code: 1, msg: '您已完成选课，不可重复提交' });
    }

    const selectedCount = records.filter(r => r.courseId === courseId).length;
    if (selectedCount >= course.quota) {
      return res.status(200).json({ code: 1, msg: '抱歉，该课程名额已满' });
    }

    records.push({
      stuKey,
      stuName,
      stuClass,
      courseId,
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    });
    await writeJsonFile('records.json', records);

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

    const courses = await readJsonFile('courses.json') || [];
    const records = await readJsonFile('records.json') || [];

    if (id > 0) {
      const selectedCount = records.filter(r => r.courseId === id).length;
      if (quota < selectedCount) {
        return res.status(200).json({ code: 1, msg: `名额不能小于当前已选人数（${selectedCount}人）` });
      }
      const idx = courses.findIndex(c => c.id === id);
      if (idx > -1) {
        courses[idx] = { ...courses[idx], name, teacher, quota };
      }
    } else {
      const newId = courses.length ? Math.max(...courses.map(c => c.id)) + 1 : 1;
      courses.push({ id: newId, name, teacher, quota });
    }

    await writeJsonFile('courses.json', courses);
    return res.status(200).json({ code: 0, msg: '保存成功' });
  }

  // 5. 删除课程
  if (action === 'deleteCourse') {
    const id = parseInt(body.id || 0);
    let courses = await readJsonFile('courses.json') || [];
    let records = await readJsonFile('records.json') || [];

    records = records.filter(r => r.courseId !== id);
    courses = courses.filter(c => c.id !== id);

    await writeJsonFile('courses.json', courses);
    await writeJsonFile('records.json', records);
    return res.status(200).json({ code: 0, msg: '删除成功' });
  }

  // 6. 删除单条选课记录
  if (action === 'deleteRecord') {
    const stuKey = body.stuKey || '';
    let records = await readJsonFile('records.json') || [];
    records = records.filter(r => r.stuKey !== stuKey);
    await writeJsonFile('records.json', records);
    return res.status(200).json({ code: 0, msg: '删除成功' });
  }

  // 7. 清空所有选课记录
  if (action === 'clearRecords') {
    await writeJsonFile('records.json', []);
    return res.status(200).json({ code: 0, msg: '已清空所有选课记录' });
  }

  return res.status(200).json({ code: 1, msg: '无效请求' });
}
