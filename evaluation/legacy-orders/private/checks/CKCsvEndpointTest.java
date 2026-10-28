package com.northstar.orders;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CKCsvEndpointTest extends DatabaseTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Test void invoiceEndpointUsesWriter() throws Exception {
        jdbc.update("UPDATE customer SET display_name=? WHERE id=1","Acme, \"East\"");
        var csv=mvc.perform(get("/api/exports/invoices.csv")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(csv.startsWith("order_id,customer,reference,gross_cents\r\n"));
        assertTrue(csv.contains("101,\"Acme, \"\"East\"\"\",PO-0007,1250\r\n"));
    }
}
