import { updateReportView } from "../models/report";


export interface Job {
    type: string;
    payload: any;
}

class JobQueueService {

    enqueue(job: Job): void {
        // In a real implementation, this would send the job to a message broker.
        console.log(`[JobQueueService] Enqueued job: ${job.type}`, job.payload);

        // --- Worker Simulation ---
        // In a real app, a separate worker process would listen to the queue.
        // To simulate this, we process the job immediately but do not await it.
        this.processJob(job);
    }

    private async processJob(job: Job) {
        if (job.type === 'UPDATE_REPORT_VIEW') {
            await updateReportView(job.payload.reportId);
        }
        // Other job types like 'REPORT_CREATED_NOTIFICATION' would be handled here.
    }
}

export default new JobQueueService();
