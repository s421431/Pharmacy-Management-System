-- Pharmacy Management System — Core Schema

-- System users (admin/pharmacist) who log in and record sales
CREATE TABLE User (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'pharmacist') NOT NULL DEFAULT 'pharmacist',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_email (email)
) ENGINE=InnoDB;

-- Vendors medicines are purchased from
CREATE TABLE Supplier (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  address VARCHAR(255),
  gst_number VARCHAR(20)
) ENGINE=InnoDB;

-- Catalog of medicines sold (not stock-specific — see Batch for that)
CREATE TABLE Medicine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100),
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  unit VARCHAR(30) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- A specific stock lot of a medicine, with its own expiry and pricing
CREATE TABLE Batch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicine_id INT NOT NULL,
  batch_number VARCHAR(50) NOT NULL,
  expiry_date DATE NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (medicine_id) REFERENCES Medicine(id) ON DELETE RESTRICT,
  INDEX idx_batch_expiry (expiry_date)
) ENGINE=InnoDB;

-- Walk-in / registered customers medicines are sold to
CREATE TABLE Customer (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20)
) ENGINE=InnoDB;

-- A purchase order/invoice received from a supplier
CREATE TABLE Purchase (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  purchase_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES Supplier(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Line items (batches received) within a Purchase
CREATE TABLE PurchaseItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES Purchase(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES Batch(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- A sales invoice made to a customer, recorded by a user
CREATE TABLE Sale (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NULL,
  user_id INT NOT NULL,
  sale_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES Customer(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Line items (batches sold) within a Sale
CREATE TABLE SaleItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  batch_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES Sale(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES Batch(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
