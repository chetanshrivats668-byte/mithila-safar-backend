import * as cabService from '../services/cabService.js';

export async function createCab(req, res) {
  try {
    const data = req.body;
    data.collaboratorId = req.collaborator.collaboratorId;
    const cab = await cabService.createCab(req.app.locals.db, data);
    res.status(201).json({ success: true, message: 'Cab created and pending approval', cab });
  } catch (e) {
    console.error('Create cab error:', e);
    res.status(500).json({ success: false, message: 'Failed to create cab' });
  }
}

export async function getCabs(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;
    const cabs = await cabService.getCabsByCollaborator(req.app.locals.db, collabId);
    res.json({ success: true, cabs });
  } catch (e) {
    console.error('Get cabs error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch cabs' });
  }
}

export async function getCab(req, res) {
  try {
    const { id } = req.params;
    const cab = await cabService.getCabById(req.app.locals.db, id);
    if (!cab) {
      return res.status(404).json({ success: false, message: 'Cab not found' });
    }
    if (cab.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, cab });
  } catch (e) {
    console.error('Get cab error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch cab' });
  }
}

export async function updateCab(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const cab = await cabService.getCabById(req.app.locals.db, id);
    if (!cab) {
      return res.status(404).json({ success: false, message: 'Cab not found' });
    }
    if (cab.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const updated = await cabService.updateCab(req.app.locals.db, id, updates);
    res.json({ success: true, message: 'Cab updated', cab: updated });
  } catch (e) {
    console.error('Update cab error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function deleteCab(req, res) {
  try {
    const { id } = req.params;
    const cab = await cabService.getCabById(req.app.locals.db, id);
    if (!cab) return res.status(404).json({ success: false, message: 'Cab not found' });
    if (cab.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await cabService.deleteCab(req.app.locals.db, id);
    res.json({ success: true, message: 'Cab deleted' });
  } catch (e) {
    console.error('Delete cab error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
}
