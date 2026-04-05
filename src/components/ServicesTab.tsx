import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  FiShoppingBag,
  FiCalendar,
  FiEye,
  FiEdit,
  FiPrinter,
  FiTrash2,
  FiPlus,
  FiPower,
  FiBattery,
  FiDownload,
  FiX,
  FiCheckSquare,
  FiSquare,
  FiSearch,
  FiPhone,
  FiClock,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiMenu  
} from "react-icons/fi";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ServiceOrder } from "./types";
import {
  badgeToneForStatus,
  formatReceiptLabel,
  openPrintReceipt,
  type ReceiptSection,
} from "./utils/receiptPrint";

// Create motion components properly to avoid deprecation warning
const MotionDiv = motion.div;
const MotionButton = motion.button;
const MotionTr = motion.tr;

interface ServicesTabProps {
  services: ServiceOrder[];
  filteredServices: ServiceOrder[];
  filterStatus: string;
  filterPriority: string;
  filterClaimType: string;
  onViewService: (service: ServiceOrder) => void;
  onEditService: (service: ServiceOrder) => void;
  onDeleteService: (id: number) => void;
  onFilterStatusChange?: (status: string) => void;
  onFilterPriorityChange?: (priority: string) => void;
  onFilterClaimTypeChange?: (claim: string) => void;
  onNewService: () => void;
  getStatusColor?: (status: string) => string;
  getPriorityColor?: (priority: string) => string;
  getPaymentStatusColor?: (status: string) => string;
  loading: boolean;
}

const ServicesTab: React.FC<ServicesTabProps> = ({
  services,
  filteredServices,
  filterStatus,
  filterPriority,
  filterClaimType,
  onViewService,
  onEditService,
  onDeleteService,
  onNewService,
  loading
}) => {
  // Date filter states
  const [dateFilterType, setDateFilterType] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // Selection states
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState<boolean>(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Last refreshed state
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Mobile menu state
  const [showMobileActions, setShowMobileActions] = useState<boolean>(false);
  
  // Window width state for responsive design
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(20);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if mobile view
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  // Update last refreshed when data changes
  useEffect(() => {
    if (services.length > 0) {
      setLastRefreshed(new Date());
    }
  }, [services]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilterType, fromDate, toDate, filterStatus, filterPriority, filterClaimType]);

  // Format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (error) {
      return dateString || '';
    }
  };

  // Format date for filename
  const formatDateForFilename = () => {
    const date = new Date();
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  // Set default from and to dates for custom range
  const setDefaultCustomRange = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    setFromDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setToDate(today.toISOString().split('T')[0]);
  };

  // Get date filtered services with search
  const getFilteredServices = (): ServiceOrder[] => {
    let filtered = [...filteredServices];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Apply date filters
    switch (dateFilterType) {
      case "today":
        filtered = filtered.filter(service => {
          const serviceDate = new Date(service.created_at);
          serviceDate.setHours(0, 0, 0, 0);
          return serviceDate.getTime() === today.getTime();
        });
        break;
      
      case "this_week":
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);
        filtered = filtered.filter(service => {
          const serviceDate = new Date(service.created_at);
          return serviceDate >= weekStart;
        });
        break;
      
      case "this_month":
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        filtered = filtered.filter(service => {
          const serviceDate = new Date(service.created_at);
          return serviceDate >= monthStart;
        });
        break;
      
      case "this_year":
        const yearStart = new Date(today.getFullYear(), 0, 1);
        yearStart.setHours(0, 0, 0, 0);
        filtered = filtered.filter(service => {
          const serviceDate = new Date(service.created_at);
          return serviceDate >= yearStart;
        });
        break;
      
      case "custom":
        if (fromDate && toDate) {
          const from = new Date(fromDate);
          from.setHours(0, 0, 0, 0);
          const to = new Date(toDate);
          to.setHours(23, 59, 59, 999);
          
          filtered = filtered.filter(service => {
            const serviceDate = new Date(service.created_at);
            return serviceDate >= from && serviceDate <= to;
          });
        }
        break;
      
      default:
        break;
    }

    // Apply search filter - MODIFIED TO INCLUDE BATTERY AND INVERTER SERIALS
    if (searchTerm && searchTerm.trim() !== '') {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(service => 
        (service.service_code && service.service_code.toLowerCase().includes(searchLower)) ||
        (service.customer_name && service.customer_name.toLowerCase().includes(searchLower)) ||
        (service.customer_phone && service.customer_phone.includes(searchTerm)) ||
        (service.battery_model && service.battery_model.toLowerCase().includes(searchLower)) ||
        (service.battery_serial && service.battery_serial.toLowerCase().includes(searchLower)) || // Added battery serial search
        (service.inverter_model && service.inverter_model.toLowerCase().includes(searchLower)) ||
        (service.inverter_serial && service.inverter_serial.toLowerCase().includes(searchLower)) || // Added inverter serial search
        (service.issue_description && service.issue_description.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  };

  const allFilteredServices = getFilteredServices();
  
  // Pagination logic
  const totalItems = allFilteredServices.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const displayServices = allFilteredServices.slice(indexOfFirstItem, indexOfLastItem);

  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.scrollTop = 0;
    }
  };

  const goToFirstPage = () => goToPage(1);
  const goToLastPage = () => goToPage(totalPages);
  const goToNextPage = () => goToPage(currentPage + 1);
  const goToPreviousPage = () => goToPage(currentPage - 1);

  // Get page numbers to display
  const getPageNumbers = (): (number | string)[] => {
    const delta = isMobile ? 1 : 2;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | undefined;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  };

  // Update select all when selection changes
  useEffect(() => {
    if (displayServices.length > 0) {
      const allSelected = displayServices.every(service => selectedItems.has(service.id));
      setSelectAll(allSelected);
    } else {
      setSelectAll(false);
    }
  }, [selectedItems, displayServices]);

  // Handle date filter change
  const handleDateFilterChange = (type: string) => {
    setDateFilterType(type);
    if (type !== "custom") {
      setFromDate("");
      setToDate("");
      setShowDatePicker(false);
    } else {
      setDefaultCustomRange();
      setShowDatePicker(true);
    }
    setSelectedItems(new Set());
    setSelectAll(false);
  };

  // Clear all filters
  const clearFilters = () => {
    setDateFilterType("all");
    setFromDate("");
    setToDate("");
    setShowDatePicker(false);
    setSearchTerm("");
    setSelectedItems(new Set());
    setSelectAll(false);
  };

  // Check if any filters are active
  const hasActiveFilters = dateFilterType !== "all" || searchTerm !== "";

  // Selection handlers
  const handleSelectItem = (id: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectAll) {
      setSelectedItems(new Set());
    } else {
      const allIds = new Set(displayServices.map(service => service.id));
      setSelectedItems(allIds);
    }
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  // Handle single delete directly without confirmation
  const handleDeleteClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    onDeleteService(id);
  };

  // Handle bulk delete directly without confirmation
  const handleBulkDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedItems.size === 0) return;
    
    selectedItems.forEach(id => {
      onDeleteService(id);
    });
    setSelectedItems(new Set());
    setSelectAll(false);
    setShowMobileActions(false);
  };

  // Handle edit click
  const handleEditClick = (e: React.MouseEvent, service: ServiceOrder) => {
    e.stopPropagation();
    e.preventDefault();
    if (onEditService) {
      onEditService(service);
    }
  };

  // Handle view click
  const handleViewClick = (e: React.MouseEvent, service: ServiceOrder) => {
    e.stopPropagation();
    e.preventDefault();
    if (onViewService) {
      onViewService(service);
    }
  };

  // Get selected services data
  const getSelectedServices = (): ServiceOrder[] => {
    return displayServices.filter(service => selectedItems.has(service.id));
  };

  // Print single receipt
  const printReceipt = (service: ServiceOrder) => {
    try {
      const equipment = service.battery_model || service.inverter_model || 'N/A';
      const equipmentSerial = service.battery_serial || service.inverter_serial || 'N/A';
      const amountSource = service.final_cost || service.estimated_cost;
      const amountNumber = amountSource ? Number(amountSource) : NaN;
      const amountValue =
        amountSource && !Number.isNaN(amountNumber)
          ? new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
            }).format(amountNumber)
          : null;
      const sections: ReceiptSection[] = [
        {
          title: "Customer Details",
          fields: [
            { label: "Customer Name", value: service.customer_name },
            { label: "Phone Number", value: service.customer_phone },
            { label: "Email Address", value: service.customer_email || null },
            {
              label: "Address",
              value: service.customer_address || null,
              wide: true,
              multiline: true,
            },
          ],
        },
        {
          title: "Service Details",
          fields: [
            { label: "Service Type", value: formatReceiptLabel(service.service_type) || "General Service" },
            { label: "Equipment", value: equipment },
            { label: "Serial Number", value: equipmentSerial === 'N/A' ? null : equipmentSerial },
            { label: "Created On", value: formatDate(service.created_at) },
            {
              label: "Issue Description",
              value: service.issue_description || "No issue description provided.",
              wide: true,
              multiline: true,
            },
          ],
        },
      ];

      const opened = openPrintReceipt({
        documentTitle: `Receipt - ${service.service_code}`,
        serviceLine: "Battery and Inverter Service",
        receiptLabel: "Service Receipt",
        code: service.service_code,
        codeLabel: "Service Code",
        issuedOn: formatDate(service.created_at),
        badges: [
          {
            label: `Status: ${formatReceiptLabel(service.status) || "Pending"}`,
            tone: badgeToneForStatus(service.status),
          },
          {
            label: `Payment: ${formatReceiptLabel(service.payment_status) || "Pending"}`,
            tone: badgeToneForStatus(service.payment_status),
          },
        ],
        amount: amountValue
          ? {
              label: service.final_cost ? "Final Amount" : "Estimated Amount",
              value: amountValue,
            }
          : null,
        sections,
        footerTitle: "Thank you for choosing Sun Office.",
        footerNote: "Computer-generated receipt from the Sun Office service desk.",
        signatureLabels: ["Customer", "Sun Office"],
      });

      if (!opened) {
        alert('Unable to start printing. Please try again.');
      }
    } catch (error) {
      console.error('Print error:', error);
      alert('Failed to print receipt. Please try again.');
    }
  };

  // Print function (for the print button in hero section)
  const handlePrint = () => {
    const selectedData = getSelectedServices();
    const dataToPrint = selectedData.length > 0 ? selectedData : displayServices;
    
    if (dataToPrint.length === 0) {
      alert('No data to print');
      return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print');
      return;
    }
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Service Call Report</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; font-size: 24px; }
          .header { margin-bottom: 20px; }
          .metadata { color: #666; font-size: 14px; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #667eea; color: white; padding: 10px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #ddd; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
          @media print {
            body { margin: 0.5in; }
            .no-print { display: none; }
          }
          @media (max-width: 768px) {
            body { margin: 10px; }
            h1 { font-size: 20px; }
            table { font-size: 12px; }
            th, td { padding: 6px; }
          }
          @media (max-width: 480px) {
            table { font-size: 11px; }
            th, td { padding: 4px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Service Call Report</h1>
          <div class="metadata">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total Records:</strong> ${dataToPrint.length}</p>
            <p><strong>Date Range:</strong> ${dateFilterType === 'today' ? 'Today' : dateFilterType === 'this_week' ? 'This Week' : dateFilterType === 'this_month' ? 'This Month' : dateFilterType === 'this_year' ? 'This Year' : dateFilterType === 'custom' ? `${formatDate(fromDate)} to ${formatDate(toDate)}` : 'All Time'}</p>
            ${selectedData.length > 0 ? `<p><strong>Showing:</strong> ${selectedData.length} selected records</p>` : ''}
          </div>
        </div>
        
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Service Code</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Equipment</th>
                <th>Serial Number</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${dataToPrint.map(service => {
                const equipment = service.battery_model || service.inverter_model || 'N/A';
                const serialNumber = service.battery_serial || service.inverter_serial || 'N/A';
                return `
                  <tr>
                    <td>${service.service_code || ''}</td>
                    <td>${service.customer_name || ''}</td>
                    <td>${service.customer_phone || ''}</td>
                    <td>${equipment}</td>
                    <td>${serialNumber}</td>
                    <td>${formatDate(service.created_at)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p>Report generated from Sun Office System</p>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; background-color: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px;">Print</button>
          <button onclick="window.close()" style="padding: 10px 20px; background-color: #6B7280; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px;">Close</button>
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Export to CSV
  const exportToCSV = (data = displayServices, type = 'all') => {
    try {
      const dataToExport = data;
      
      if (dataToExport.length === 0) {
        alert('No data to export');
        return;
      }
      
      let csvContent = "";
      
      const headers = [
        'Service Code',
        'Customer Name',
        'Customer Phone',
        'Battery Model',
        'Battery Serial',
        'Inverter Model',
        'Inverter Serial',
        'Created Date',
        'Warranty Status',
        'AMC Status',
        'Notes'
      ];
      
      csvContent += headers.join(',') + '\n';
      
      dataToExport.forEach(service => {
        const row = [
          `"${(service.service_code || '').replace(/"/g, '""')}"`,
          `"${(service.customer_name || '').replace(/"/g, '""')}"`,
          `"${(service.customer_phone || '').replace(/"/g, '""')}"`,
          `"${(service.battery_model || '').replace(/"/g, '""')}"`,
          `"${(service.battery_serial || '').replace(/"/g, '""')}"`,
          `"${(service.inverter_model || '').replace(/"/g, '""')}"`,
          `"${(service.inverter_serial || '').replace(/"/g, '""')}"`,
          `"${formatDate(service.created_at)}"`,
          `"${(service.warranty_status || '').replace(/"/g, '""')}"`,
          `"${(service.amc_status || '').replace(/"/g, '""')}"`,
          `"${(service.notes || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(',') + '\n';
      });

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const fileName = type === 'selected' 
        ? `selected_service_calls_${formatDateForFilename()}.csv`
        : `service_calls_${formatDateForFilename()}.csv`;
      
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      if (type === 'selected') {
        setShowMobileActions(false);
      }
      
    } catch (error) {
      console.error('CSV Export Error:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  // Export to PDF
  const exportToPDF = (data = displayServices, type = 'all') => {
    try {
      const dataToExport = data;
      
      if (dataToExport.length === 0) {
        alert('No data to export');
        return;
      }
      
      const doc = new jsPDF({
        orientation: isMobile ? 'portrait' : 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      doc.setFillColor(102, 126, 234);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 15, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUN OFFICE', 14, 10);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Inverter & Battery Service', 14, 13);

      doc.setTextColor(0, 0, 0);
      
      doc.setFontSize(isMobile ? 14 : 16);
      doc.setFont('helvetica', 'bold');
      doc.text('Service Call Report', doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });
      
      doc.setFontSize(isMobile ? 8 : 9);
      doc.setFont('helvetica', 'normal');
      
      let yPos = 35;
      
      let dateRangeText = 'Date Range: ';
      switch (dateFilterType) {
        case 'today':
          dateRangeText += `Today (${new Date().toLocaleDateString()})`;
          break;
        case 'this_week':
          dateRangeText += 'This Week';
          break;
        case 'this_month':
          dateRangeText += 'This Month';
          break;
        case 'this_year':
          dateRangeText += 'This Year';
          break;
        case 'custom':
          dateRangeText += `${fromDate ? formatDate(fromDate) : 'Start'} to ${toDate ? formatDate(toDate) : 'End'}`;
          break;
        default:
          dateRangeText += 'All Time';
      }
      doc.text(dateRangeText, 14, yPos);
      
      yPos += 5;
      doc.text(`Total Records: ${dataToExport.length}`, 14, yPos);
      
      yPos += 5;
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);

      const tableColumn = isMobile 
        ? ['Code', 'Customer', 'Equipment', 'Serial', 'Date']
        : ['Service Code', 'Customer', 'Phone', 'Equipment', 'Serial Number', 'Date'];

      const tableRows = dataToExport.map(service => {
        const equipment = service.battery_model || service.inverter_model || 'N/A';
        const serialNumber = service.battery_serial || service.inverter_serial || 'N/A';
        
        if (isMobile) {
          return [
            service.service_code || '',
            service.customer_name || '',
            equipment,
            serialNumber,
            formatDate(service.created_at)
          ];
        }
        return [
          service.service_code || '',
          service.customer_name || '',
          service.customer_phone || '',
          equipment,
          serialNumber,
          formatDate(service.created_at)
        ];
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        theme: 'grid',
        styles: {
          fontSize: isMobile ? 7 : 10,
          cellPadding: isMobile ? 2 : 3,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [102, 126, 234],
          textColor: [255, 255, 255],
          fontSize: isMobile ? 7 : 10,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: isMobile 
          ? {
              0: { cellWidth: 30 },
              1: { cellWidth: 40 },
              2: { cellWidth: 40 },
              3: { cellWidth: 40 },
              4: { cellWidth: 30 }
            }
          : {
              0: { cellWidth: 35 },
              1: { cellWidth: 45 },
              2: { cellWidth: 30 },
              3: { cellWidth: 40 },
              4: { cellWidth: 40 },
              5: { cellWidth: 35 }
            },
        didDrawPage: () => {
          const pageCount = doc.getNumberOfPages();
          for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
              `Page ${i} of ${pageCount}`,
              doc.internal.pageSize.getWidth() - 20,
              doc.internal.pageSize.getHeight() - 10
            );
          }
        }
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 60;

      doc.setFillColor(240, 249, 255);
      doc.rect(14, finalY + 10, doc.internal.pageSize.getWidth() - 28, 25, 'F');
      
      doc.setFontSize(isMobile ? 10 : 12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(102, 126, 234);
      doc.text('Summary', 20, finalY + 20);
      
      doc.setFontSize(isMobile ? 7 : 9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      doc.text(`Total Service Calls: ${dataToExport.length}`, 20, finalY + 30);

      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        'This is a computer generated document - valid without signature',
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 15,
        { align: 'center' }
      );

      const fileName = type === 'selected'
        ? `selected_service_calls_${formatDateForFilename()}.pdf`
        : `service_calls_${formatDateForFilename()}.pdf`;
      
      doc.save(fileName);
      
      if (type === 'selected') {
        setShowMobileActions(false);
      }
      
    } catch (error) {
      console.error('PDF Export Error:', error);
      alert('Failed to export PDF. Please make sure you have jspdf and jspdf-autotable installed.');
    }
  };

  // Export selected items to CSV
  const exportSelectedToCSV = () => {
    const dataToExport = displayServices.filter(service => selectedItems.has(service.id));
    
    if (dataToExport.length === 0) {
      alert('No items selected for export');
      return;
    }
    
    exportToCSV(dataToExport, 'selected');
  };

  // Export selected items to PDF
  const exportSelectedToPDF = () => {
    const dataToExport = displayServices.filter(service => selectedItems.has(service.id));
    
    if (dataToExport.length === 0) {
      alert('No items selected for export');
      return;
    }
    
    exportToPDF(dataToExport, 'selected');
  };

  // Determine equipment type
  const getEquipmentType = (service: ServiceOrder) => {
    if (service.battery_model) return 'battery';
    if (service.inverter_model) return 'inverter';
    return 'unknown';
  };

  // Get equipment model
  const getEquipmentModel = (service: ServiceOrder) => {
    const type = getEquipmentType(service);
    if (type === 'battery') return service.battery_model;
    if (type === 'inverter') return service.inverter_model;
    return 'No equipment';
  };

  // Get equipment serial
  const getEquipmentSerial = (service: ServiceOrder) => {
    const type = getEquipmentType(service);
    if (type === 'battery') return service.battery_serial;
    if (type === 'inverter') return service.inverter_serial;
    return '';
  };

  // Get equipment icon
  const getEquipmentIcon = (service: ServiceOrder) => {
    const type = getEquipmentType(service);
    return type === 'inverter' ? <FiPower /> : <FiBattery />;
  };

  // Render mobile card view
  const renderMobileCard = (service: ServiceOrder) => (
    <div
      key={service.id}
      onClick={() => handleViewClick(new MouseEvent('click') as any, service)}
      style={{
        backgroundColor: selectedItems.has(service.id) ? '#eff6ff' : '#fff',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        border: '1px solid #e5e7eb',
        cursor: 'pointer'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MotionDiv
            onClick={(e) => handleSelectItem(service.id, e)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: selectedItems.has(service.id) ? '#667eea' : '#6b7280'
            }}
          >
            {selectedItems.has(service.id) ? <FiCheckSquare size={20} /> : <FiSquare size={20} />}
          </MotionDiv>
          <div>
            <div style={{ fontWeight: '600', color: '#111827', fontSize: '16px' }}>{service.service_code}</div>
            <div style={{ fontSize: '12px', color: '#667eea', fontWeight: '500' }}>#{service.id}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewClick(e, service);
            }}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#fff',
              color: '#3b82f6',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FiEye size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditClick(e, service);
            }}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#fff',
              color: '#f59e0b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FiEdit size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Customer</div>
          <div style={{ fontWeight: '500', fontSize: '14px' }}>{service.customer_name}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiPhone size={10} /> {service.customer_phone}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Equipment</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: getEquipmentType(service) === 'inverter' ? '#f0f9ff' : '#fef3c7',
              color: getEquipmentType(service) === 'inverter' ? '#0369a1' : '#92400e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px'
            }}>
              {getEquipmentIcon(service)}
            </div>
            <div>
              <div style={{ fontWeight: '500', fontSize: '14px' }}>{getEquipmentModel(service)}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>{getEquipmentSerial(service) || 'No serial'}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Created Date</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiCalendar size={12} color="#6b7280" />
            <span style={{ fontSize: '12px' }}>{formatDate(service.created_at)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            printReceipt(service);
          }}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
            color: '#10b981',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <FiPrinter size={14} />
          Print
        </button>
        <button
          onClick={(e) => handleDeleteClick(e, service.id)}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            backgroundColor: '#fee2e2',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <FiTrash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div className="orders-section" style={{
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      padding: '0',
      width: '100%'
    }}>
      {/* Hero Section - Responsive */}
      <div className="pending-calls-hero" style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: isMobile ? '20px 16px' : '30px 24px',
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)',
          pointerEvents: 'none'
        }} />
        
        <div className="hero-content" style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '12px' : '20px',
          position: 'relative',
          zIndex: 1,
          flexWrap: 'wrap'
        }}>
          <motion.div 
            className="hero-icon-wrapper"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            style={{
              width: isMobile ? '50px' : '60px',
              height: isMobile ? '50px' : '60px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isMobile ? '24px' : '30px',
              flexShrink: 0
            }}
          >
            <FiShoppingBag />
          </motion.div>
          <div className="hero-text" style={{ flex: 1 }}>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{
                margin: '0 0 4px 0',
                fontSize: isMobile ? '20px' : '28px',
                fontWeight: '600',
                lineHeight: 1.2
              }}
            >
              Service Calls
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{
                margin: '0',
                fontSize: isMobile ? '12px' : '14px',
                opacity: '0.9'
              }}
            >
              Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, totalItems)} of {totalItems} service calls
            </motion.p>
          </div>
        </div>
        
        {/* Hero Actions - Responsive */}
        <motion.div 
          className="hero-actions"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          style={{
            position: isMobile ? 'relative' : 'absolute',
            right: isMobile ? 'auto' : '24px',
            top: isMobile ? 'auto' : '50%',
            transform: isMobile ? 'none' : 'translateY(-50%)',
            marginTop: isMobile ? '16px' : '0',
            display: 'flex',
            gap: isMobile ? '8px' : '10px',
            zIndex: 1,
            flexWrap: 'wrap',
            justifyContent: isMobile ? 'flex-start' : 'flex-end'
          }}
        >
          {/* Mobile Menu Toggle - Only visible on mobile */}
          {isMobile && (
            <motion.button 
              className="btn mobile-menu-btn"
              onClick={() => setShowMobileActions(!showMobileActions)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'white',
                color: '#667eea',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                width: '100%',
                justifyContent: 'center'
              }}
            >
              <FiMenu size={18} />
              <span>Actions</span>
            </motion.button>
          )}

          {/* Actions - Hidden on mobile unless menu is open */}
          {(!isMobile || showMobileActions) && (
            <>
              {/* Create New Order Button */}
              <motion.button 
                className="btn new-order-btn"
                onClick={() => {
                  onNewService();
                  if (isMobile) setShowMobileActions(false);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Create New Service Call"
                style={{
                  padding: isMobile ? '8px 12px' : '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'white',
                  color: '#667eea',
                  cursor: 'pointer',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '4px' : '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  flex: isMobile ? '1' : 'auto',
                  justifyContent: 'center'
                }}
              >
                <FiPlus size={isMobile ? 16 : 18} />
                <span>{isMobile ? 'New' : 'New Call'}</span>
              </motion.button>

              {/* CSV Button */}
              <motion.button 
                className="btn csv-btn"
                onClick={() => {
                  exportToCSV();
                  if (isMobile) setShowMobileActions(false);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={displayServices.length === 0}
                title="Export to CSV"
                style={{
                  padding: isMobile ? '8px 12px' : '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'white',
                  color: '#10b981',
                  cursor: displayServices.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '4px' : '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  opacity: displayServices.length === 0 ? 0.5 : 1,
                  flex: isMobile ? '1' : 'auto',
                  justifyContent: 'center'
                }}
              >
                <FiDownload size={isMobile ? 14 : 16} />
                <span>CSV</span>
              </motion.button>
              
              {/* PDF Button */}
              <motion.button 
                className="btn pdf-btn"
                onClick={() => {
                  exportToPDF();
                  if (isMobile) setShowMobileActions(false);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={displayServices.length === 0}
                title="Export to PDF"
                style={{
                  padding: isMobile ? '8px 12px' : '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'white',
                  color: '#ef4444',
                  cursor: displayServices.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '4px' : '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  opacity: displayServices.length === 0 ? 0.5 : 1,
                  flex: isMobile ? '1' : 'auto',
                  justifyContent: 'center'
                }}
              >
                <FiDownload size={isMobile ? 14 : 16} />
                <span>PDF</span>
              </motion.button>
              
              {/* Print Button */}
              <motion.button 
                className="btn print-btn"
                onClick={() => {
                  handlePrint();
                  if (isMobile) setShowMobileActions(false);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={displayServices.length === 0}
                title="Print"
                style={{
                  padding: isMobile ? '8px 12px' : '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'white',
                  color: '#3b82f6',
                  cursor: displayServices.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? '4px' : '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  opacity: displayServices.length === 0 ? 0.5 : 1,
                  flex: isMobile ? '1' : 'auto',
                  justifyContent: 'center'
                }}
              >
                <FiPrinter size={isMobile ? 14 : 16} />
                <span>Print</span>
              </motion.button>
            </>
          )}
        </motion.div>
      </div>

      {/* Filter Bar - Responsive */}
      <div className="search-filter-bar" style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        gap: isMobile ? '12px' : '16px',
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: 'wrap',
        alignItems: isMobile ? 'stretch' : 'center'
      }}>
        {/* Search Box */}
        <div className="search-box" style={{
          position: 'relative',
          flex: isMobile ? 'auto' : '2',
          width: '100%'
        }}>
          <FiSearch className="search-icon" style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            fontSize: '16px',
            zIndex: 1
          }} />
          <input
            type="text"
            placeholder={isMobile ? "Search..." : "Search by code, customer, phone, equipment, or serial number..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{
              width: '100%',
              padding: isMobile ? '10px 12px 10px 40px' : '10px 12px 10px 40px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: isMobile ? '14px' : '14px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
          {searchTerm && (
            <motion.button 
              className="clear-search"
              onClick={() => setSearchTerm('')}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
                padding: '4px'
              }}
            >
              <FiX size={16} />
            </motion.button>
          )}
        </div>

        {/* Date Filter */}
        <div className="filter-box" style={{
          position: 'relative',
          flex: isMobile ? 'auto' : '1',
          width: isMobile ? '100%' : 'auto'
        }}>
          <FiCalendar className="filter-icon" style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            fontSize: '16px',
            zIndex: 1
          }} />
          <select
            value={dateFilterType}
            onChange={(e) => handleDateFilterChange(e.target.value)}
            className="filter-select"
            style={{
              width: '100%',
              padding: isMobile ? '10px 12px 10px 40px' : '10px 12px 10px 40px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#374151',
              fontSize: isMobile ? '14px' : '14px',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '14px'
            }}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <MotionButton
            className="btn clear-filters"
            onClick={clearFilters}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: isMobile ? '10px 16px' : '10px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: isMobile ? '14px' : '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              justifyContent: 'center',
              width: isMobile ? '100%' : 'auto'
            }}
            title="Clear all filters"
          >
            <FiX size={14} />
            Clear Filters
          </MotionButton>
        )}
      </div>

      {/* Custom Date Range Picker - Responsive */}
      {showDatePicker && (
        <div className="date-range-picker" style={{
          padding: isMobile ? '12px 16px' : '12px 24px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          gap: isMobile ? '12px' : '16px',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: isMobile ? '13px' : '13px', color: '#6b7280', fontWeight: '500' }}>Custom Range:</span>
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            alignItems: 'center', 
            flexWrap: 'wrap',
            flexDirection: isMobile ? 'column' : 'row',
            width: isMobile ? '100%' : 'auto'
          }}>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: isMobile ? '14px' : '13px',
                outline: 'none',
                backgroundColor: '#fff',
                width: isMobile ? '100%' : 'auto'
              }}
            />
            <span style={{ color: '#6b7280' }}>to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: isMobile ? '14px' : '13px',
                outline: 'none',
                backgroundColor: '#fff',
                width: isMobile ? '100%' : 'auto'
              }}
            />
          </div>
        </div>
      )}

      {/* Info Panel - Responsive */}
      <div className="city-info-panel" style={{
        padding: isMobile ? '12px 16px' : '12px 24px',
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        gap: isMobile ? '16px' : '24px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div className="info-item" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <FiShoppingBag className="info-icon" style={{ color: '#10b981', fontSize: isMobile ? '16px' : '18px' }} />
          <div className="info-text">
            <span className="info-label" style={{ fontSize: '11px', color: '#6b7280', display: 'block' }}>Total Calls</span>
            <span className="info-value" style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '600', color: '#111827' }}>{services.length}</span>
          </div>
        </div>
        
        <div className="info-item" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <FiClock className="info-icon" style={{ color: '#f59e0b', fontSize: isMobile ? '16px' : '18px' }} />
          <div className="info-text">
            <span className="info-label" style={{ fontSize: '11px', color: '#6b7280', display: 'block' }}>Last Updated</span>
            <span className="info-value" style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '600', color: '#111827' }}>{lastRefreshed.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Results Info with Selection Controls - Responsive */}
      {displayServices.length > 0 && (
        <motion.div 
          className="results-info"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{
            padding: isMobile ? '12px 16px' : '12px 24px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexDirection: isMobile ? 'column' : 'row',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div className="results-left" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'space-between' : 'flex-start'
          }}>
            <div className="selection-controls" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap'
            }}>
              <button 
                className="select-all-btn"
                onClick={handleSelectAll}
                title={selectAll ? "Deselect all" : "Select all"}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: isMobile ? '12px' : '12px'
                }}
              >
                {selectAll ? <FiCheckSquare size={14} /> : <FiSquare size={14} />}
                <span>{selectAll ? 'Deselect All' : 'Select All'}</span>
              </button>
              
              {selectedItems.size > 0 && (
                <>
                  <span className="selection-count" style={{
                    fontSize: isMobile ? '12px' : '12px',
                    color: '#667eea',
                    fontWeight: '500'
                  }}>
                    {selectedItems.size} selected
                  </span>
                  <button 
                    className="clear-selection-btn"
                    onClick={handleClearSelection}
                    title="Clear selection"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#6b7280'
                    }}
                  >
                    <FiX size={14} />
                  </button>
                  
                  {/* Bulk Delete Button */}
                  <button 
                    className="bulk-delete-btn"
                    onClick={handleBulkDeleteClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #fecaca',
                      background: '#fee2e2',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: isMobile ? '12px' : '12px',
                      fontWeight: '500'
                    }}
                  >
                    <FiTrash2 size={12} />
                    <span>Delete Selected</span>
                  </button>

                  {/* Export Selected Buttons - Hide on very small screens */}
                  {!isMobile && (
                    <>
                      <button 
                        className="export-selected-csv"
                        onClick={exportSelectedToCSV}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: '1px solid #d1fae5',
                          background: '#d1fae5',
                          color: '#10b981',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}
                      >
                        <FiDownload size={12} />
                        <span>Export CSV</span>
                      </button>
                      <button 
                        className="export-selected-pdf"
                        onClick={exportSelectedToPDF}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: '1px solid #fee2e2',
                          background: '#fee2e2',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}
                      >
                        <FiDownload size={12} />
                        <span>Export PDF</span>
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            
            <span className="results-count" style={{
              fontSize: isMobile ? '12px' : '12px',
              color: '#6b7280'
            }}>
              Showing <strong>{indexOfFirstItem + 1}-{Math.min(indexOfLastItem, totalItems)}</strong> of <strong>{totalItems}</strong> service calls
            </span>
            
            {searchTerm && (
              <span className="search-term" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: '#e0f2fe',
                borderRadius: '16px',
                fontSize: isMobile ? '11px' : '11px',
                color: '#0369a1'
              }}>
                Filtered by: "{searchTerm}"
                <button onClick={() => setSearchTerm('')} style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#0369a1',
                  display: 'flex',
                  padding: '2px'
                }}>
                  <FiX size={12} />
                </button>
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Table/List Container */}
      <div className="table-container" style={{ 
        padding: '0', 
        overflowX: isMobile ? 'visible' : 'auto',
        maxHeight: 'calc(100vh - 400px)',
        overflowY: 'auto'
      }}>
        {loading ? (
          <div className="loading-state" style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div className="loading-spinner" style={{
              width: isMobile ? '40px' : '48px',
              height: isMobile ? '40px' : '48px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <p style={{ margin: '0', fontSize: isMobile ? '14px' : '14px' }}>Loading service calls...</p>
          </div>
        ) : displayServices.length > 0 ? (
          <>
            {/* Mobile Card View */}
            {isMobile && (
              <div style={{ padding: '16px' }}>
                {displayServices.map((service) => renderMobileCard(service))}
              </div>
            )}

            {/* Tablet and Desktop Table View */}
            {!isMobile && (
              <table className="orders-table" style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: isTablet ? '13px' : '14px',
                minWidth: isTablet ? '900px' : '1100px'
              }}>
                <thead>
                  <tr style={{
                    backgroundColor: '#667eea',
                    borderBottom: '2px solid #e5e7eb'
                  }}>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'center',
                      width: '40px'
                    }}>
                      <MotionDiv
                        onClick={handleSelectAll}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff'
                        }}
                      >
                        {selectAll ? <FiCheckSquare size={16} /> : <FiSquare size={16} />}
                      </MotionDiv>
                    </th>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#ffffff',
                      fontSize: isTablet ? '11px' : '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>Service Code</th>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#ffffff',
                      fontSize: isTablet ? '11px' : '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>Customer</th>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#ffffff',
                      fontSize: isTablet ? '11px' : '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>Equipment</th>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#ffffff',
                      fontSize: isTablet ? '11px' : '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>Serial Number</th>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'left',
                      fontWeight: '600',
                      color: '#ffffff',
                      fontSize: isTablet ? '11px' : '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>Created Date</th>
                    <th style={{
                      padding: isTablet ? '12px' : '14px',
                      textAlign: 'center',
                      fontWeight: '600',
                      color: '#ffffff',
                      fontSize: isTablet ? '11px' : '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayServices.map((service, index) => (
                    <MotionTr 
                      key={service.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{ backgroundColor: '#f9fafb' }}
                      onClick={() => handleViewClick(new MouseEvent('click') as any, service)}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: selectedItems.has(service.id) ? '#eff6ff' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <td style={{ 
                        padding: isTablet ? '12px' : '14px',
                        textAlign: 'center',
                        width: '40px'
                      }}>
                        <MotionDiv
                          onClick={(e) => handleSelectItem(service.id, e)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: selectedItems.has(service.id) ? '#667eea' : '#6b7280'
                          }}
                        >
                          {selectedItems.has(service.id) ? <FiCheckSquare size={16} /> : <FiSquare size={16} />}
                        </MotionDiv>
                      </td>
                      <td style={{ padding: isTablet ? '12px' : '14px' }}>
                        <div style={{ fontWeight: '600', color: '#111827', fontSize: isTablet ? '13px' : '14px' }}>{service.service_code}</div>
                      </td>
                      <td style={{ padding: isTablet ? '12px' : '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: isTablet ? '32px' : '36px',
                            height: isTablet ? '32px' : '36px',
                            borderRadius: '50%',
                            backgroundColor: '#667eea',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '600',
                            fontSize: isTablet ? '13px' : '14px',
                            flexShrink: 0
                          }}>
                            {service.customer_name?.charAt(0) || 'C'}
                          </div>
                          <div>
                            <div style={{ fontWeight: '500', color: '#111827', marginBottom: '2px', fontSize: isTablet ? '13px' : '14px' }}>{service.customer_name}</div>
                            <div style={{ fontSize: isTablet ? '11px' : '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FiPhone size={isTablet ? 9 : 10} /> {service.customer_phone}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: isTablet ? '12px' : '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: isTablet ? '32px' : '36px',
                            height: isTablet ? '32px' : '36px',
                            borderRadius: '8px',
                            backgroundColor: getEquipmentType(service) === 'inverter' ? '#f0f9ff' : '#fef3c7',
                            color: getEquipmentType(service) === 'inverter' ? '#0369a1' : '#92400e',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: isTablet ? '16px' : '18px',
                            flexShrink: 0
                          }}>
                            {getEquipmentIcon(service)}
                          </div>
                          <div>
                            <div style={{ fontWeight: '500', color: '#111827', marginBottom: '2px', fontSize: isTablet ? '13px' : '14px' }}>
                              {getEquipmentModel(service)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: isTablet ? '12px' : '14px' }}>
                        <div style={{ 
                          fontSize: isTablet ? '12px' : '13px', 
                          color: '#4b5563',
                          fontFamily: 'monospace',
                          backgroundColor: '#f3f4f6',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          display: 'inline-block'
                        }}>
                          {getEquipmentSerial(service) || 'N/A'}
                        </div>
                      </td>
                      <td style={{ padding: isTablet ? '12px' : '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FiCalendar style={{ color: '#6b7280', fontSize: isTablet ? '11px' : '12px' }} />
                          <span style={{ fontSize: isTablet ? '12px' : '13px', color: '#4b5563' }}>
                            {formatDate(service.created_at)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: isTablet ? '12px' : '14px' }}>
                        <div style={{
                          display: 'flex',
                          gap: isTablet ? '4px' : '6px',
                          justifyContent: 'center'
                        }}>
                          <MotionButton 
                            className="action-btn view"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewClick(e, service);
                            }}
                            whileHover={{ scale: 1.1, backgroundColor: '#e0f2fe' }}
                            whileTap={{ scale: 0.9 }}
                            title="View Details"
                            style={{
                              width: isTablet ? '30px' : '32px',
                              height: isTablet ? '30px' : '32px',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb',
                              backgroundColor: '#fff',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isTablet ? '13px' : '14px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <FiEye />
                          </MotionButton>
                          <MotionButton 
                            className="action-btn edit"
                            onClick={(e) => handleEditClick(e, service)}
                            whileHover={{ scale: 1.1, backgroundColor: '#fef3c7' }}
                            whileTap={{ scale: 0.9 }}
                            title="Edit Service Call"
                            style={{
                              width: isTablet ? '30px' : '32px',
                              height: isTablet ? '30px' : '32px',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb',
                              backgroundColor: '#fff',
                              color: '#f59e0b',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isTablet ? '13px' : '14px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <FiEdit />
                          </MotionButton>
                          <MotionButton 
                            className="action-btn print"
                            onClick={(e) => {
                              e.stopPropagation();
                              printReceipt(service);
                            }}
                            whileHover={{ scale: 1.1, backgroundColor: '#d1fae5' }}
                            whileTap={{ scale: 0.9 }}
                            title="Print Receipt"
                            style={{
                              width: isTablet ? '30px' : '32px',
                              height: isTablet ? '30px' : '32px',
                              borderRadius: '6px',
                              border: '1px solid #e5e7eb',
                              backgroundColor: '#fff',
                              color: '#10b981',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isTablet ? '13px' : '14px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <FiPrinter />
                          </MotionButton>
                          <MotionButton 
                            className="action-btn delete"
                            onClick={(e) => handleDeleteClick(e, service.id)}
                            whileHover={{ scale: 1.1, backgroundColor: '#fee2e2' }}
                            whileTap={{ scale: 0.9 }}
                            title="Delete Service Call"
                            style={{
                              width: isTablet ? '30px' : '32px',
                              height: isTablet ? '30px' : '32px',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fff',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isTablet ? '13px' : '14px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <FiTrash2 />
                          </MotionButton>
                        </div>
                      </td>
                    </MotionTr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <div className="empty-state" style={{
            padding: isMobile ? '40px 16px' : '60px 20px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{
              width: isMobile ? '60px' : '70px',
              height: isMobile ? '60px' : '70px',
              borderRadius: '50%',
              backgroundColor: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: isMobile ? '30px' : '35px',
              color: '#9ca3af'
            }}>
              <FiShoppingBag />
            </div>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              color: '#374151'
            }}>No service calls found</h3>
            <p style={{
              margin: '0 0 20px 0',
              fontSize: isMobile ? '14px' : '14px',
              color: '#6b7280',
              padding: '0 16px'
            }}>
              {services.length === 0 
                ? 'Create your first service call to get started'
                : 'No results match your search or filters. Try adjusting your criteria.'
              }
            </p>
            <MotionButton 
              className="btn primary"
              onClick={onNewService}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: isMobile ? '10px 20px' : '10px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#667eea',
                color: '#fff',
                cursor: 'pointer',
                fontSize: isMobile ? '14px' : '14px',
                fontWeight: '500',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FiPlus />
              Create New Service Call
            </MotionButton>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination" style={{
          padding: isMobile ? '16px' : '20px 24px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '12px' : '0'
        }}>
          <div style={{
            color: '#6b7280',
            fontSize: isMobile ? '13px' : '14px',
            order: isMobile ? 2 : 1
          }}>
            Showing <strong>{indexOfFirstItem + 1}-{Math.min(indexOfLastItem, totalItems)}</strong> of <strong>{totalItems}</strong> results
          </div>
          
          <div style={{
            display: 'flex',
            gap: isMobile ? '6px' : '8px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            order: isMobile ? 1 : 2
          }}>
            {/* First Page Button */}
            <MotionButton
              onClick={goToFirstPage}
              disabled={currentPage === 1}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: isMobile ? '8px 12px' : '8px 14px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: currentPage === 1 ? '#f3f4f6' : '#fff',
                color: currentPage === 1 ? '#9ca3af' : '#4b5563',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: isMobile ? '13px' : '14px',
                opacity: currentPage === 1 ? 0.6 : 1
              }}
              title="First Page"
            >
              <FiChevronsLeft size={isMobile ? 14 : 16} />
              {!isMobile && <span>First</span>}
            </MotionButton>

            {/* Previous Page Button */}
            <MotionButton
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: isMobile ? '8px 12px' : '8px 14px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: currentPage === 1 ? '#f3f4f6' : '#fff',
                color: currentPage === 1 ? '#9ca3af' : '#4b5563',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: isMobile ? '13px' : '14px',
                opacity: currentPage === 1 ? 0.6 : 1
              }}
              title="Previous Page"
            >
              <FiChevronLeft size={isMobile ? 14 : 16} />
              {!isMobile && <span>Prev</span>}
            </MotionButton>

            {/* Page Numbers */}
            {getPageNumbers().map((page, index) => (
              page === '...' ? (
                <span
                  key={`dots-${index}`}
                  style={{
                    padding: isMobile ? '8px 10px' : '8px 12px',
                    color: '#6b7280',
                    fontSize: isMobile ? '13px' : '14px'
                  }}
                >
                  ...
                </span>
              ) : (
                <MotionButton
                  key={page}
                  onClick={() => goToPage(page as number)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: isMobile ? '8px 12px' : '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: currentPage === page ? '#667eea' : '#e5e7eb',
                    backgroundColor: currentPage === page ? '#667eea' : '#fff',
                    color: currentPage === page ? '#fff' : '#4b5563',
                    cursor: 'pointer',
                    minWidth: isMobile ? '36px' : '40px',
                    fontWeight: currentPage === page ? '600' : '400',
                    fontSize: isMobile ? '13px' : '14px',
                    boxShadow: currentPage === page ? '0 2px 4px rgba(102,126,234,0.3)' : 'none'
                  }}
                >
                  {page}
                </MotionButton>
              )
            ))}

            {/* Next Page Button */}
            <MotionButton
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: isMobile ? '8px 12px' : '8px 14px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: currentPage === totalPages ? '#f3f4f6' : '#fff',
                color: currentPage === totalPages ? '#9ca3af' : '#4b5563',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: isMobile ? '13px' : '14px',
                opacity: currentPage === totalPages ? 0.6 : 1
              }}
              title="Next Page"
            >
              {!isMobile && <span>Next</span>}
              <FiChevronRight size={isMobile ? 14 : 16} />
            </MotionButton>

            {/* Last Page Button */}
            <MotionButton
              onClick={goToLastPage}
              disabled={currentPage === totalPages}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: isMobile ? '8px 12px' : '8px 14px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: currentPage === totalPages ? '#f3f4f6' : '#fff',
                color: currentPage === totalPages ? '#9ca3af' : '#4b5563',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: isMobile ? '13px' : '14px',
                opacity: currentPage === totalPages ? 0.6 : 1
              }}
              title="Last Page"
            >
              {!isMobile && <span>Last</span>}
              <FiChevronsRight size={isMobile ? 14 : 16} />
            </MotionButton>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .filter-select:hover,
        .btn:hover,
        .action-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .filter-select:focus,
        input:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 2px rgba(102,126,234,0.1);
        }
        
        .date-range-picker input:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 2px rgba(102,126,234,0.1);
        }
        
        .btn.csv-btn:hover {
          background-color: #10b981 !important;
          color: white !important;
        }
        
        .btn.pdf-btn:hover {
          background-color: #ef4444 !important;
          color: white !important;
        }
        
        .btn.print-btn:hover {
          background-color: #3b82f6 !important;
          color: white !important;
        }
        
        .btn.new-order-btn:hover {
          background-color: #667eea !important;
          color: white !important;
        }

        /* Responsive table styles */
        @media (max-width: 768px) {
          .orders-table {
            min-width: 700px;
          }
        }

        @media (max-width: 480px) {
          .orders-table {
            min-width: 100%;
          }
        }

        /* Scrollbar styling */
        .table-container::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .table-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }

        .table-container::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
        }

        .table-container::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }

        /* Pagination button hover effect */
        .pagination button:hover:not(:disabled) {
          border-color: #667eea;
          box-shadow: 0 2px 4px rgba(102,126,234,0.2);
        }
      `}</style>
    </div>
  );
};

export default ServicesTab;
