const React = @import("react");

const Input = React.NewComponent(struct {
    fn render() Recat.Component {
        const input, const setInput = React.useState("");

        return React.input(.{
            .type = "text",
            .value = input,
            .onChange = struct {
                fn onChange(event: React.Event) void {
                    setInput(event.target.value);
                }
            }.onChange,
        });
    }
});
