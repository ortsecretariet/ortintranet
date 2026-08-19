const db = require('./db');

try {
  // Check if profile_picture exists in users
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some(col => col.name === 'profile_picture')) {
    db.exec("ALTER TABLE users ADD COLUMN profile_picture TEXT");
    console.log("Added profile_picture to users");
  }

  // Check if status exists in resources
  const resourceColumns = db.prepare('PRAGMA table_info(resources)').all();
  if (!resourceColumns.some(col => col.name === 'status')) {
    db.exec("ALTER TABLE resources ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))");
    console.log("Added status to resources");
  }
  
  // Check if reject_reason exists in resources
  if (!resourceColumns.some(col => col.name === 'reject_reason')) {
    db.exec("ALTER TABLE resources ADD COLUMN reject_reason TEXT");
    console.log("Added reject_reason to resources");
  }

  console.log("Migration successful");
} catch (error) {
  console.error("Migration failed:", error);
}
