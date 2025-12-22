import { Router } from 'express';
import { getMyCallLogs, deleteCallLog } from '../controller/callLog.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyJWT);

router.get('/my-logs', getMyCallLogs);
router.delete('/:callLogId', deleteCallLog);

export default router;
