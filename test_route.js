// Test the route eligibility function with the examples provided
function checkRouteEligibility(fromCity, toCity, routeCities) {
    if (!fromCity || !toCity || !routeCities || routeCities.length < 2) {
        return false;
    }
    
    // Normalize city names to lowercase for case-insensitive comparison
    const normalizedFrom = fromCity.toLowerCase().trim();
    const normalizedTo = toCity.toLowerCase().trim();
    
    // Find indices of cities in the route
    const fromIndex = routeCities.findIndex(city => city.toLowerCase().trim() === normalizedFrom);
    const toIndex = routeCities.findIndex(city => city.toLowerCase().trim() === normalizedTo);
    
    // Both cities must exist in route AND destination must come after origin
    return fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex;
}

// Test Case 1: Eligible route
const route1 = ['Bishaul', 'Madhubani', 'Samastipur', 'Patna', 'Delhi'];
console.log('Test 1: Route:', route1.join(' → '));
console.log('Checking Madhubani → Delhi:', checkRouteEligibility('Madhubani', 'Delhi', route1) ? 'Eligible' : 'Not eligible');
console.log();

// Test Case 2: Not eligible route (wrong direction)
const route2 = ['Delhi', 'Patna', 'Madhubani'];
console.log('Test 2: Route:', route2.join(' → '));
console.log('Checking Madhubani → Delhi:', checkRouteEligibility('Madhubani', 'Delhi', route2) ? 'Eligible' : 'Not eligible');
console.log();

// Test Case 3: Not eligible route (missing city)
const route3 = ['Bishaul', 'Madhubani', 'Samastipur', 'Patna'];
console.log('Test 3: Route:', route3.join(' → '));
console.log('Checking Madhubani → Delhi:', checkRouteEligibility('Madhubani', 'Delhi', route3) ? 'Eligible' : 'Not eligible');
console.log();

// Test Case 4: Same city (should be not eligible)
console.log('Test 4: Checking Madhubani → Madhubani:', checkRouteEligibility('Madhubani', 'Madhubani', route1) ? 'Eligible' : 'Not eligible');