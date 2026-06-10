import { get as dbGet, update as dbUpdate } from '../utils/db.js';
import * as collabService from '../services/collabService.js';

// Normalize collaborator row (PostgREST returns lowercase keys)
function n(c) {
  if (!c) return c;
  c.verification_status = c.verification_status || c.verificationStatus || c.verificationstatus || 'pending';
  c.partnerCollabStatus = c.partnerCollabStatus || c.partnercollabstatus || 'pending';
  c.submittedFrom = c.submittedFrom || c.submittedfrom || null;
  c.verifiedAt = c.verifiedAt || c.verifiedat || null;
  c.verifiedBy = c.verifiedBy || c.verifiedby || null;
  c.approvedAt = c.approvedAt || c.approvedat || null;
  c.approvedBy = c.approvedBy || c.approvedby || null;
  c.partnerCollabRejectedAt = c.partnerCollabRejectedAt || c.partnercollabrejectedat || null;
  c.partnerCollabReapplyAfter = c.partnerCollabReapplyAfter || c.partnercollabreapplyafter || null;
  return c;
}

export async function requestVerification(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;

    const collabSnap = n(await collabService.getCollaboratorById(req.app.locals.db, collabId));
    if (!collabSnap) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }

    await collabService.updateCollaborator(req.app.locals.db, collabId, {
      verificationStatus: 'pending',
      verificationRequestedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Verification request submitted. Admin will review your documents.' });
  } catch (e) {
    console.error('Request verification error:', e);
    res.status(500).json({ success: false, message: 'Failed to submit verification request' });
  }
}

export async function getVerificationStatus(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;

    const collabSnap = n(await collabService.getCollaboratorById(req.app.locals.db, collabId));
    if (!collabSnap) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    res.json({
      success: true,
      verificationStatus: {
        status: collabSnap.verification_status || 'pending',
        verifiedAt: collabSnap.verifiedAt,
        verifiedBy: collabSnap.verifiedBy,
        rejectionReason: collabSnap.rejectionReason
      }
    });
  } catch (e) {
    console.error('Get verification status error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
}

export async function adminVerifyCollaborator(req, res) {
  try {
    const { collaboratorId, action } = req.body;
    if (!action || !['verify', 'accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be verify, accept, or reject.' });
    }

    const collabSnap = n(await collabService.getCollaboratorById(req.app.locals.db, collaboratorId));
    if (!collabSnap) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }

    const isNewRegistration = collabSnap.verification_status === 'pending' && collabSnap.status === 'pending';
    const isVerify = action === 'verify' || action === 'accept';

    const updates = {
      verificationStatus: isVerify ? 'verified' : 'rejected',
      verifiedAt: new Date().toISOString(),
      verifiedBy: req.admin?.username || 'admin'
    };

    if (isVerify && isNewRegistration) {
      // Mark registration as approved so it matches public listing filters
      updates.status = 'approved';
    }

    if (action === 'reject') {
      await collabService.deleteCollaborator(req.app.locals.db, collaboratorId);
      return res.json({ success: true, message: 'Collaborator rejected and deleted.' });
    }

    await collabService.updateCollaborator(req.app.locals.db, collaboratorId, updates);

    res.json({ success: true, message: 'Registration approved!' });
  } catch (e) {
    console.error('Admin verify error:', e);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
}

export async function approvePartnerCollab(req, res) {
  try {
    const { collaboratorId, action } = req.body || {};
    if (!collaboratorId || !action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'collaboratorId and valid action (approve or reject) are required' });
    }

    const collabSnap = n(await collabService.getCollaboratorById(req.app.locals.db, collaboratorId));
    if (!collabSnap) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }

    const adminId = req.admin?.username || req.admin?.email || 'admin';
    const now = new Date().toISOString();
    const updates = {
      partnerCollabStatus: action === 'approve' ? 'approved' : 'rejected',
      approvedAt: action === 'approve' ? now : null,
      approvedBy: action === 'approve' ? adminId : null,
      partnerCollabRejectedAt: action === 'reject' ? now : null,
      partnerCollabReapplyAfter: action === 'reject' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
    };

    if (action === 'approve') {
      if (collabSnap.verification_status !== 'verified') {
        updates.verificationStatus = 'verified';
      }
      if (collabSnap.status === 'pending' || collabSnap.status === 'rejected') {
        updates.status = 'approved';
      }
    }

    await collabService.updateCollaborator(req.app.locals.db, collaboratorId, updates);

    return res.json({
      success: true,
      message: action === 'approve' ? 'Partner collaboration approved.' : 'Partner collaboration rejected.',
      collaboratorId,
      partnerCollabStatus: updates.partnerCollabStatus,
      approvedAt: updates.approvedAt,
      approvedBy: updates.approvedBy,
      reapplyAfter: updates.partnerCollabReapplyAfter
    });
  } catch (e) {
    console.error('Approve partner collab error:', e);
    return res.status(500).json({ success: false, message: 'Partner collaboration review failed' });
  }
}

export async function adminSuspendCollaborator(req, res) {
  try {
    const { collaboratorId } = req.body;

    const collabSnap = n(await collabService.getCollaboratorById(req.app.locals.db, collaboratorId));
    if (!collabSnap) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }

    await collabService.deleteCollaborator(req.app.locals.db, collaboratorId);

    res.json({ success: true, message: 'Collaborator deleted.' });
  } catch (e) {
    console.error('Suspend collaborator error:', e);
    res.status(500).json({ success: false, message: 'Suspension failed' });
  }
}

export async function adminUnsuspendCollaborator(req, res) {
  try {
    const { collaboratorId } = req.body;

    const collabSnap = n(await collabService.getCollaboratorById(req.app.locals.db, collaboratorId));
    if (!collabSnap) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }

    const currentStatus = collabSnap.verification_status;
    const newStatus = currentStatus === 'suspended' ? 'verified' : 'pending';

    await collabService.updateCollaborator(req.app.locals.db, collaboratorId, {
      verificationStatus: newStatus,
      unsuspendedAt: new Date().toISOString(),
      unsuspendedBy: req.admin?.username || 'admin'
    });

    res.json({ success: true, message: 'Collaborator unsuspended' });
  } catch (e) {
    console.error('Unsuspend collaborator error:', e);
    res.status(500).json({ success: false, message: 'Unsuspension failed' });
  }
}

export async function adminApproveService(req, res) {
  try {
    const { serviceId, action, serviceType } = req.body;
    if (!serviceId || !action || !serviceType) {
      return res.status(400).json({ success: false, message: 'serviceId, serviceType, and action are required' });
    }
    const validTypes = ['bus', 'hotel', 'cafe', 'cab'];
    const validActions = ['approve', 'reject'];
    if (!validTypes.includes(serviceType)) {
      return res.status(400).json({ success: false, message: 'Invalid service type' });
    }
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const collectionMap = { bus: 'collaborator_buses', hotel: 'collaborator_hotels', cafe: 'collaborator_cafes', cab: 'collaborator_cabs' };
    const tableName = collectionMap[serviceType];
    const existing = await dbGet(tableName, serviceId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const updates = {
      status: action === 'approve' ? 'active' : 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: req.admin?.username || 'admin'
    };
    await dbUpdate(tableName, serviceId, updates);

    import('../services/auditLogService.js').then(m => m.logAction(req.app.locals.db, {
      actorId: null,
      actorRole: 'admin',
      action: action === 'approve' ? 'approve_service' : 'reject_service',
      entityType: serviceType,
      entityId: serviceId,
      details: { newStatus: updates.status }
    })).catch(() => {});

    res.json({ success: true, message: `${serviceType} ${action}ed` });
  } catch (e) {
    console.error('Admin approve service error:', e);
    res.status(500).json({ success: false, message: 'Service review failed' });
  }
}
