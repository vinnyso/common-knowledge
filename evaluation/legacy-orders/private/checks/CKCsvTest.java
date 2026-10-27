package com.northstar.orders;

import com.northstar.orders.accounting.CsvWriter;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CKCsvTest {
    @Test void quotesAndPreservesExactBytes() {
        assertEquals("plain,\"a,b\",\"say \"\"hi\"\"\",\"a\rb\",\"a\nb\",\"a\r\nb\",,  spaces  ,é\r\n",
            CsvWriter.row(List.of("plain","a,b","say \"hi\"","a\rb","a\nb","a\r\nb","","  spaces  ","é")));
        assertEquals("\r\n",CsvWriter.row(List.of()));
        assertEquals("\"\"\"\"\r\n",CsvWriter.row(List.of("\"")));
        assertEquals(",\r\n",CsvWriter.row(List.of("","")));
    }
}
