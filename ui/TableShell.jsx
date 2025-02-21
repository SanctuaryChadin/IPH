// ui/TableShell.jsx
export default function TableShell({ columns = [], children }) {
  return (
    <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse' }}>
      <thead style={{ backgroundColor: '#f3f3f3' }}>
        <tr>
          {columns.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>

      <tbody>
        {children /* This is where your rows will be inserted */}
      </tbody>
    </table>
  );
}
