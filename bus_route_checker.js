// Function to check if a bus is available between two cities based on its route
function checkBusAvailability(fromCity, toCity, routeCities) {
    // Validate inputs
    if (!fromCity || !toCity || !routeCities || !Array.isArray(routeCities) || routeCities.length < 2) {
        return `No bus found that travels from ${fromCity} to ${toCity}.`;
    }
    
    // Normalize city names to lowercase for case-insensitive comparison
    const normalizedFrom = fromCity.toLowerCase().trim();
    const normalizedTo = toCity.toLowerCase().trim();
    
    // Find indices of cities in the route
    const fromIndex = routeCities.findIndex(city => city.toLowerCase().trim() === normalizedFrom);
    const toIndex = routeCities.findIndex(city => city.toLowerCase().trim() === normalizedTo);
    
    // Both cities must exist in route AND destination must come after origin
    if (fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex) {
        return `Yes, this bus goes from ${fromCity} to ${toCity}.`;
    } else {
        return `No bus found that travels from ${fromCity} to ${toCity}.`;
    }
}

// Test the function with the provided examples
console.log('Testing bus route availability:');

// Test Case 1: Eligible route
const route1 = ['Bishaul', 'Madhubani', 'Samastipur', 'Patna', 'Delhi'];
console.log(`Route: ${route1.join(' → ')}`);
console.log(checkBusAvailability('Madhubani', 'Delhi', route1));
console.log();

// Test Case 2: Not eligible route (wrong direction)
const route2 = ['Delhi', 'Patna', 'Madhubani'];
console.log(`Route: ${route2.join(' → ')}`);
console.log(checkBusAvailability('Madhubani', 'Delhi', route2));
console.log();

// Test Case 3: Not eligible route (missing city)
const route3 = ['Bishaul', 'Madhubani', 'Samastipur', 'Patna'];
console.log(`Route: ${route3.join(' → ')}`);
console.log(checkBusAvailability('Madhubani', 'Delhi', route3));
console.log();

// Test Case 4: Same city (should be not eligible)
console.log(`Route: ${route1.join(' → ')}`);
console.log(checkBusAvailability('Madhubani', 'Madhubani', route1));
console.log();

// Additional test cases
console.log('Additional test cases:');

// Test Case 5: Eligible with different cities
console.log(`Route: ${route1.join(' → ')}`);
console.log(checkBusAvailability('Samastipur', 'Delhi', route1));
console.log();

// Test Case 6: Not eligible (destination before origin)
console.log(`Route: ${route1.join(' → ')}`);
console.log(checkBusAvailability('Delhi', 'Madhubani', route1));