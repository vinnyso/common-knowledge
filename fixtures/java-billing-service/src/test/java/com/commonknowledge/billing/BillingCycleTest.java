package com.commonknowledge.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.TimeZone;
import org.junit.jupiter.api.Test;

class BillingCycleTest {
  @Test
  void createsMonthlyInvoiceWithExpectedDetails() {
    CustomerAccount customer = new CustomerAccount("acct-1042", "billing@example.test");
    Instant instant = Instant.parse("2025-06-15T12:00:00Z");
    Clock clock = Clock.fixed(instant, ZoneId.of("UTC"));
    TimeZone original = TimeZone.getDefault();

    try {
      TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of("America/Los_Angeles")));
      Invoice invoice = new BillingCycle(clock).createMonthlyInvoice(customer, BigDecimal.TEN);

      assertEquals(customer, invoice.customer());
      assertEquals(BigDecimal.TEN, invoice.amountDue());
      assertEquals(LocalDate.of(2025, 6, 15), invoice.closeDate());
    } finally {
      TimeZone.setDefault(original);
    }
  }
}
