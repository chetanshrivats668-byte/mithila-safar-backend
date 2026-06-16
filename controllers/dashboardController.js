import { list as dbList, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function getDashboardOverview(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;

    const buses = await dbList('collaborator_buses', {
      filters: [{ column: 'collaboratorId', op: 'eq', value: collabId }]
    });

    const allOrders = await dbList('orders', {
      orderBy: { column: 'createdAt', ascending: false }
    });

    const collabBookings = allOrders.filter(o => o.collaboratorId === collabId || o.partnerPhone === req.collaborator.phone);

    const totalBookings = collabBookings.filter(o => o.status === 'confirmed').length;
    const confirmedBookings = totalBookings;
    const pendingBookings = collabBookings.filter(o => o.status === 'payment_pending').length;
    const totalEarnings = collabBookings
      .filter(o => o.status === 'confirmed')
      .reduce((sum, o) => sum + (o.amount || 0), 0);

    const activeBuses = buses.filter(b => b.status === 'active').length;

    res.json({
      success: true,
      dashboard: {
        totalBookings,
        confirmedBookings,
        pendingBookings,
        totalEarnings,
        activeBuses,
        totalBuses: buses.length,
        recentBookings: collabBookings.filter(o => o.status === 'confirmed').slice(0, 10)
      }
    });
  } catch (e) {
    console.error('Dashboard overview error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
  }
}

export async function getBookings(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;

    const allOrders = await dbList('orders', {
      orderBy: { column: 'createdAt', ascending: false }
    });
    const collabBookings = allOrders.filter(o => 
      (o.collaboratorId === collabId || o.partnerPhone === req.collaborator.phone) &&
      o.status === 'confirmed'
    );

    res.json({ success: true, bookings: collabBookings });
  } catch (e) {
    console.error('Get bookings error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
  }
}

export async function getEarnings(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;

    const allOrders = await dbList('orders', {
      orderBy: { column: 'createdAt', ascending: false }
    });
    const confirmedOrders = allOrders.filter(o =>
      (o.collaboratorId === collabId || o.partnerPhone === req.collaborator.phone) && o.status === 'confirmed'
    );

    const monthlyEarnings = {};
    confirmedOrders.forEach(o => {
      const month = new Date(o.createdAt).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      monthlyEarnings[month] = (monthlyEarnings[month] || 0) + (o.amount || 0);
    });

    const totalEarnings = confirmedOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    res.json({
      success: true,
      earnings: {
        total: totalEarnings,
        monthly: monthlyEarnings,
        breakdown: confirmedOrders.map(o => ({
          orderId: o.orderId,
          amount: o.amount,
          date: o.createdAt,
          type: o.type,
          itemName: o.itemName
        }))
      }
    });
  } catch (e) {
    console.error('Get earnings error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch earnings' });
  }
}
